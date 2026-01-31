import request from 'supertest';
import {app} from "../src/index.js";

describe('Domains should work correctly', () => {
    const mockUser = {
        username: 'domainTestUser',
        email: 'myMail@studio.unibo.it',
        password: 'password123'
    };

    it('should retrieve the correct domain for a user', async () => {
        const regRes = await request(app)
            .post('/register')
            .send(mockUser);

        const res = await request(app)
            .get('/domain/' + regRes.body.username);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('domain');
        expect(res.body.domain).toEqual({
            name: 'unibo.it',
            subdomain: 'studio'
        });
    });

    it('should retrieve the correct domain level for a user', async () => {
        const regRes = await request(app)
            .post('/register')
            .send(mockUser);

        const res = await request(app)
            .get('/domain/level/' + regRes.body.username);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('domainLevel');
        expect(res.body.domainLevel).toEqual(2);
    });
});