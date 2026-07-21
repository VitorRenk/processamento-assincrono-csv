import amqp from 'amqplib'; import {PrismaClient} from '@prisma/client'; import Redis from 'ioredis'; import {Client} from 'minio'; import {analyseCsvStream} from '@fluxocsv/shared/csv'; import {reportCsv, reportHtml} from '@fluxocsv/shared/report';
const prisma = new PrismaClient(); const redis = new Redis(process.env.REDIS_URL!); const bucket = 'fluxocsv'; const queue = 'csv.process';
const minio = new Client({endPoint:process.env.MINIO_ENDPOINT!, port:Number(process.env.MINIO_PORT), useSSL:false, accessKey:process.env.MINIO_ACCESS_KEY!, secretKey:process.env.MINIO_SECRET_KEY!});
async function setProgress(jobId:string, percent:number, stage:string, message:string) { const event = JSON.stringify({percent,stage,message}); await redis.set(`job:${jobId}:progress`,event,'EX',86400); await redis.publish(`job:${jobId}:events`,event); }
async function saveObject(key:string, content:string, type:string) { await minio.putObject(bucket,key,Buffer.from(content),Buffer.byteLength(content),{'Content-Type':type}); }
async function run(jobId:string) { const job = await prisma.job.findUnique({where:{id:jobId}}); if (!job || job.status === 'completed') return; await prisma.job.update({where:{id:jobId},data:{status:'processing',attempts:{increment:1},error:null}}); await setProgress(jobId,8,'reading','Lendo arquivo enviado.'); const metadata = await minio.statObject(bucket, job.sourceKey); const stream = await minio.getObject(bucket, job.sourceKey); let bytesRead = 0, lastPercent = 8; async function* monitoredStream() { for await (const chunk of stream) { const buffer = Buffer.from(chunk); bytesRead += buffer.length; const percent = Math.min(60, 8 + Math.floor((bytesRead / metadata.size) * 52)); if (percent >= lastPercent + 2) { lastPercent = percent; await setProgress(jobId, percent, 'reading', `Processando arquivo: ${percent}%`); } yield buffer; } } const report = await analyseCsvStream(monitoredStream()); await setProgress(jobId,62,'calculating','Calculando indicadores e ranking.'); const base = `reports/${job.userId}/${job.id}`; const csvKey=`${base}/resumo-vendas.csv`, htmlKey=`${base}/relatorio-vendas.html`; await saveObject(csvKey,reportCsv(report),'text/csv; charset=utf-8'); await saveObject(htmlKey,reportHtml(report,job.sourceName),'text/html; charset=utf-8'); await setProgress(jobId,88,'reporting','Salvando relatórios.'); await prisma.$transaction([prisma.jobResult.upsert({where:{jobId},update:{rows:report.rows,validRows:report.valid,invalidRows:report.invalid,revenue:report.revenue,units:report.units,average:report.average,ranking:report.ranking},create:{jobId,rows:report.rows,validRows:report.valid,invalidRows:report.invalid,revenue:report.revenue,units:report.units,average:report.average,ranking:report.ranking}}),prisma.reportFile.upsert({where:{jobId_format:{jobId,format:'csv'}},update:{objectKey:csvKey},create:{jobId,format:'csv',objectKey:csvKey}}),prisma.reportFile.upsert({where:{jobId_format:{jobId,format:'html'}},update:{objectKey:htmlKey},create:{jobId,format:'html',objectKey:htmlKey}}),prisma.job.update({where:{id:jobId},data:{status:'completed'}})]); await setProgress(jobId,100,'completed','Relatório pronto para download.'); }
async function boot() {
  if (!(await minio.bucketExists(bucket))) await minio.makeBucket(bucket);
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  await channel.assertQueue(queue, {durable: true});
  await channel.assertQueue(`${queue}.dead`, {durable: true});
  channel.prefetch(1);

  await channel.consume(queue, async (message) => {
    if (!message) return;
    const {jobId} = JSON.parse(message.content.toString());
    try {
      await run(jobId);
      channel.ack(message);
    } catch (error: any) {
      const job = await prisma.job.findUnique({where: {id: jobId}});
      const text = error?.message ?? 'Falha desconhecida';
      if ((job?.attempts ?? 0) < 3) {
        await setProgress(jobId, 0, 'retrying', 'Falha temporária; tentando novamente.');
        channel.sendToQueue(queue, Buffer.from(JSON.stringify({jobId})), {persistent: true});
      } else {
        await prisma.job.update({where: {id: jobId}, data: {status: 'failed', error: text}});
        await setProgress(jobId, 100, 'failed', text);
        channel.sendToQueue(`${queue}.dead`, Buffer.from(JSON.stringify({jobId, error: text})), {persistent: true});
      }
      channel.ack(message);
    }
  });
  console.log('Worker aguardando jobs.');
}
boot().catch(error => {console.error(error);process.exit(1);});
