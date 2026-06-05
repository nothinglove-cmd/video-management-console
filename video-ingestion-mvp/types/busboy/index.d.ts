declare module "busboy" {
  import type { Readable, Writable } from "node:stream";

  type HeaderValue = string | string[] | undefined;

  interface BusboyConfig {
    headers: Record<string, HeaderValue>;
    defParamCharset?: string;
    limits?: {
      fields?: number;
      fieldSize?: number;
      files?: number;
      fileSize?: number;
      parts?: number;
      headerPairs?: number;
    };
  }

  interface FileInfo {
    filename: string;
    encoding: string;
    mimeType: string;
  }

  interface FieldInfo {
    nameTruncated: boolean;
    valueTruncated: boolean;
    encoding: string;
    mimeType: string;
  }

  interface BusboyParser extends Writable {
    on(event: "field", listener: (name: string, value: string, info: FieldInfo) => void): this;
    on(event: "file", listener: (name: string, stream: Readable, info: FileInfo) => void): this;
    on(event: "fieldsLimit" | "filesLimit" | "partsLimit" | "close" | "finish", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  function busboy(config: BusboyConfig): BusboyParser;

  export default busboy;
}
