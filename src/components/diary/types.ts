export interface Document {
  title: string;
  diaryDate: string;
  tags: string[];
  contentMarkdown: string;
}
export interface Entry {
  id: string;
  revision: number;
  document: Document;
  updatedAt: string;
}
export interface Metadata {
  id: string;
  revision: number;
  title: string;
  diaryDate: string;
  tags?: string[];
  excerpt: string;
  updatedAt: string;
}
export interface Session {
  username: string;
  csrfToken: string;
  expiresAt: string;
}
