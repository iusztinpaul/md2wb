// Minimal typings for the untyped dependencies, covering only what md2wb uses.

declare module "mathjax" {
  export interface MathJaxAdaptor {
    innerHTML(node: unknown): string;
  }
  export interface MathJaxInstance {
    tex2svgPromise(tex: string, options?: { display?: boolean }): Promise<unknown>;
    startup: { adaptor: MathJaxAdaptor };
  }
  const MathJax: {
    init(config: Record<string, unknown>): Promise<MathJaxInstance>;
  };
  export default MathJax;
}

declare module "opentype.js" {
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    charToGlyph(char: string): { advanceWidth?: number };
  }
  const opentype: {
    parse(buffer: ArrayBuffer): Font;
  };
  export default opentype;
}
