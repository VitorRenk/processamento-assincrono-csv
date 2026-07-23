import {PrismaClient} from '@prisma/client'; import {Client} from 'minio'; import Redis from 'ioredis'; import amqp from 'amqplib';
export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL!);
export const minio = new Client({endPoint: process.env.MINIO_ENDPOINT!, port: Number(process.env.MINIO_PORT), useSSL: false, accessKey: process.env.MINIO_ACCESS_KEY!, secretKey: process.env.MINIO_SECRET_KEY!, region: process.env.MINIO_REGION ?? 'us-east-1'});
// This client only signs browser-facing URLs. The API itself always uses the internal Docker hostname above.
export const minioPublic = new Client({endPoint: process.env.MINIO_PUBLIC_ENDPOINT!, port: Number(process.env.MINIO_PORT), useSSL: false, accessKey: process.env.MINIO_ACCESS_KEY!, secretKey: process.env.MINIO_SECRET_KEY!, region: process.env.MINIO_REGION ?? 'us-east-1'});
export const BUCKET = 'fluxocsv'; export const QUEUE = 'csv.process';
export async function ensureBucket() { if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET); }
export async function publishJob(jobId: string) { const connection = await amqp.connect(process.env.RABBITMQ_URL!); const channel = await connection.createChannel(); await channel.assertQueue(QUEUE, {durable: true, arguments: {'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${QUEUE}.dead`}}); await channel.assertQueue(`${QUEUE}.dead`, {durable: true}); channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify({jobId})), {persistent: true}); await channel.close(); await connection.close(); }
export async function progress(jobId: string, payload: object) { const value = JSON.stringify(payload); await redis.set(`job:${jobId}:progress`, value, 'EX', 86400); await redis.publish(`job:${jobId}:events`, value); }
