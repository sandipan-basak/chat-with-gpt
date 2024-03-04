import express from 'express';
import axios from 'axios';
import { config } from '../config';

export default class QueryToPromptMiddleware {
    static async generatePrompt(req: express.Request, res: express.Response, next: express.NextFunction) {
        try {
            const { messages } = req.body;
            const query = messages.length > 0 ? messages[0].content : '';

            const response = await axios.post(`${config.pythonServiceUrl}/create-prompt`, { query });

            req.body.messages = [{ role: "user", content: response.data.prompt }];

            next();
        } catch (error) {
            console.error('Error generating prompt:', error);
            res.status(500).send({ error: 'Failed to generate prompt' });
        }
    }
}