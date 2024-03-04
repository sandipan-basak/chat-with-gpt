import express from 'express';
import axios from 'axios';
import { config } from '../config';

export default class QueryToPromptMiddleware {
    static async generatePrompt(req: express.Request, res: express.Response, next: express.NextFunction) {
        try {
            // Extract query from the request body
            const { query } = req.body;

            // Call the Python service to generate a prompt
            const response = await axios.post(config.pythonServiceUrl, { query });


            // Attach the generated prompt to the request object
            req.prompt = response.data.prompt;

            next();
        } catch (error) {
            console.error('Error generating prompt:', error);
            res.status(500).send({ error: 'Failed to generate prompt' });
        }
    }
}
