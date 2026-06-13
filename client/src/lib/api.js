import axios from 'axios';

const apiKey = typeof window !== 'undefined' ? window.__API_KEY__ : '';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
    },
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.error || error.message || 'Unknown error';
        return Promise.reject(new Error(message));
    }
);

export default api;
