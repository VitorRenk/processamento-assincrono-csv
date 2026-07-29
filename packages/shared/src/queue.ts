export const PROCESSING_QUEUE = 'csv.process';
export const DEAD_LETTER_QUEUE = `${PROCESSING_QUEUE}.dead`;

export const processingQueueOptions = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': DEAD_LETTER_QUEUE,
  },
};
