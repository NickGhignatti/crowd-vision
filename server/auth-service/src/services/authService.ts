import {type IDomain, User} from '../models/user.js';
import bcrypt from 'bcrypt';

export const registerUser = async (username: string, email: string, password: string) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new Error('User already exists');
    }

    const fullDomainName = String(email).split('@')[1] || '';
    const allDomains = fullDomainName.split('.');
    const domain = {
        name: [allDomains.at(-2), allDomains.at(-1)].join('.'),
        subdomain: allDomains.length > 2 ? allDomains.slice(0, -2).join('.') : '',
    };
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    return await User.create({
        username,
        email,
        password: passwordHash,
        domain
    });
};

export const loginUser = async (username: string, password: string) => {
    const user = await User.findOne({ username });
    if (!user) {
        throw new Error('Invalid username or password');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        throw new Error('Invalid password');
    }

    return user;
}

export const getUserDomain = async (userId: string) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    return {
        name: user.domain.name,
        subdomain: user.domain.subdomain
    };
}

export const getDomainLevel = async (domain: IDomain) => {
    let rank = 1;

    switch(domain.subdomain) {
        case 'studio':
            rank += 1;
            break;
        default:
            break;
    }

    return rank;
}