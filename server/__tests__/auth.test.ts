import request =  require('supertest');
import {app} from "../src";

describe('Auth should work', () => {
    const mockUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
    };

    it('should create a new user', async () => {
        const res = await request(app)
            .post('/createUser')
            .send(mockUser);

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('User created successfully.');
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user.username).toBe(mockUser.username);
    });

    it('should validate an existing user with correct password', async () => {
        await request(app).post('/createUser').send(mockUser);

        const res = await request(app)
            .post('/validateUser')
            .send({
                username: mockUser.username,
                password: mockUser.password
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Login successful');
    });

    it('should reject login with incorrect password', async () => {
        await request(app).post('/createUser').send(mockUser);

        const res = await request(app)
            .post('/validateUser')
            .send({
                username: mockUser.username,
                password: 'wrongpassword'
            });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid password');
    });
});