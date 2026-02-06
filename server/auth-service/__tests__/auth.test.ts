import request from 'supertest';
import {app} from "../src/index.js";

describe('Auth should work', () => {
    const mockUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
    };

    it('should create a new user', async () => {
        const res = await request(app)
            .post('/register')
            .send(mockUser);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('userId');
    });

    it('should validate an existing user with correct password', async () => {
        await request(app).post('/register').send(mockUser);

        const res = await request(app)
            .post('/login')
            .send({
                username: mockUser.username,
                password: mockUser.password
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Login successful');
    });

    it('should reject login with incorrect password', async () => {
        await request(app).post('/register').send(mockUser);

        const res = await request(app)
            .post('/login')
            .send({
                username: mockUser.username,
                password: 'wrongpassword'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid password');
    });

    it('should fail if user does not exist', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: 'ghostuser',
                password: 'password'
            });

        expect(res.status).toBe(400);
    });
});