export interface RenderedImage {
  alt: string;
  src: string;
  width: number;
  height: number;
}

/** All data-URI images in the output, with PNG dimensions read from the IHDR chunk. */
export function images(html: string): RenderedImage[] {
  return [...html.matchAll(/<img src="(data:[^"]+)" alt="([^"]*)"/g)].map(([, src, alt]) => {
    const data = Buffer.from(src!.split(",")[1]!, "base64");
    const png = src!.startsWith("data:image/png");
    return {
      alt: alt!,
      src: src!,
      width: png ? data.readUInt32BE(16) : 0,
      height: png ? data.readUInt32BE(20) : 0,
    };
  });
}

/** The article HTML inside #content, without the preview chrome. */
export function content(html: string): string {
  const start = html.indexOf('<div id="content">');
  const end = html.indexOf("<script>");
  return html.slice(start, end);
}
