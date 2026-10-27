export type ActionState = {
  ok?: boolean;
  message?: string;
  warning?: string;
  fieldErrors?: Record<string, string>;
  /** Zeitstempel, damit wiederholte Erfolgsmeldungen erkannt werden */
  ts?: number;
  data?: Record<string, unknown>;
};
