import request from "supertest";
import { app } from "../src/index.js";
import { Conversation } from "../src/models/conversation.js";

const claimsHeaderFor = (payload: object) =>
  Buffer.from(JSON.stringify(payload)).toString("base64");

const headerFor = (accountId: string) => claimsHeaderFor({ sub: accountId });

// setup.ts already provides a blanket agent-service fetch mock for every test.

describe("conversation API", () => {
  it("creates, lists, opens, renames, and deletes a conversation", async () => {
    const header = headerFor("user-a");
    const created = await request(app)
      .post("/conversations")
      .set("x-gateway-claims", header)
      .send({});

    expect(created.status).toBe(201);
    expect(created.body.title).toBe("New chat");

    const list = await request(app).get("/conversations").set("x-gateway-claims", header);
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0].messages).toBeUndefined();

    const id = created.body._id as string;
    expect(
      (await request(app).get(`/conversations/${id}`).set("x-gateway-claims", header)).status,
    ).toBe(200);

    const renamed = await request(app)
      .patch(`/conversations/${id}`)
      .set("x-gateway-claims", header)
      .send({ title: "Building questions" });
    expect(renamed.body.title).toBe("Building questions");

    expect(
      (await request(app).delete(`/conversations/${id}`).set("x-gateway-claims", header))
        .status,
    ).toBe(204);
  });

  it("returns 404 for another user's conversation", async () => {
    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Private",
      messages: [],
    });
    const header = headerFor("user-b");

    const responses = await Promise.all([
      request(app).get(`/conversations/${conversation.id}`).set("x-gateway-claims", header),
      request(app)
        .patch(`/conversations/${conversation.id}`)
        .set("x-gateway-claims", header)
        .send({ title: "No" }),
      request(app)
        .delete(`/conversations/${conversation.id}`)
        .set("x-gateway-claims", header),
      request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("x-gateway-claims", header)
        .send({ content: "No" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
  });

  it("forwards history and saves both messages after a successful response", async () => {
    const header = headerFor("user-a");
    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Existing",
      messages: [
        { role: "user", content: "Earlier", createdAt: new Date() },
        { role: "assistant", content: "Previous reply", createdAt: new Date() },
      ],
    });
    jest.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        answer: "New reply",
        citations: [
          {
            chunk_id: "chunk",
            document_id: "document",
            source: "source.md",
            section_path: null,
          },
        ],
      }),
    } as Response);

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("x-gateway-claims", header)
      .send({ content: "Follow-up" });

    expect(response.status).toBe(201);
    expect(response.body.content).toBe("New reply");
    const requestBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[0]?.[1]?.body),
    );
    expect(requestBody).toEqual({
      question: "Follow-up",
      history: [
        { role: "user", content: "Earlier" },
        { role: "assistant", content: "Previous reply" },
      ],
      stream: false,
    });
    expect(jest.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-gateway-claims": header,
    });

    const saved = await Conversation.findById(conversation.id);
    expect(saved?.messages).toHaveLength(4);
    expect(saved?.messages.at(-1)?.citations).toHaveLength(1);
  });

  it("does not save either message when agent-service fails", async () => {
    const header = headerFor("user-a");
    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Existing",
      messages: [],
    });
    jest.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("x-gateway-claims", header)
      .send({ content: "Question" });

    expect(response.status).toBe(502);
    const saved = await Conversation.findById(conversation.id);
    expect(saved?.messages).toHaveLength(0);
  });

  it("caps forwarded history and rejects conversations at the message limit", async () => {
    const header = headerFor("user-a");
    const messages = Array.from({ length: 100 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${index}`,
      createdAt: new Date(),
    }));
    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Full",
      messages,
    });

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("x-gateway-claims", header)
      .send({ content: "One more" });

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards only the configured recent history window", async () => {
    const header = headerFor("user-a");
    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Long chat",
      messages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `Message ${index}`,
        createdAt: new Date(),
      })),
    });

    await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("x-gateway-claims", header)
      .send({ content: "Next" });

    const requestBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[0]?.[1]?.body),
    );
    expect(requestBody.history).toHaveLength(10);
    expect(requestBody.history[0].content).toBe("Message 2");
    expect(requestBody.history.at(-1).content).toBe("Message 11");
  });

  it("requires authentication and validates content", async () => {
    expect((await request(app).get("/conversations")).status).toBe(401);

    const conversation = await Conversation.create({
      userId: "user-a",
      title: "Existing",
      messages: [],
    });
    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("x-gateway-claims", headerFor("user-a"))
      .send({ content: " " });
    expect(response.status).toBe(400);
  });

  it("rejects tokens without the stable accountId claim", async () => {
    const nameOnlyHeader = claimsHeaderFor({ accountName: "mutable-name" });

    const response = await request(app)
      .get("/conversations")
      .set("x-gateway-claims", nameOnlyHeader);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Authentication token is missing an account id",
    );
  });
});
