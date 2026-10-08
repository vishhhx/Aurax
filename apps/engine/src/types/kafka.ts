export interface KafkaMessageMeta {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}
