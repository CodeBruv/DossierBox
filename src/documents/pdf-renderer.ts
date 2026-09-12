import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PresentationModel } from "./export-presentation";
import { paginatePresentation } from "./presentation-pagination";

const FONT_ROOT = join(process.cwd(), "node_modules", "@fontsource", "open-sans", "files");
const MAX_BLOCKS = 10_000;

export async function renderPresentationPdf(model: PresentationModel): Promise<Buffer> {
  if (model.blocks.length > MAX_BLOCKS) throw new PdfRenderError("resource-limit");
  const regular = join(FONT_ROOT, model.typography.regularFont);
  const bold = join(FONT_ROOT, model.typography.boldFont);
  if (!existsSync(regular) || !existsSync(bold)) throw new PdfRenderError("font-unavailable");
  const pages = paginatePresentation(model);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({
      size: [model.paper.widthPoints, model.paper.heightPoints],
      margins: model.margins,
      info: { Title: "DossierBox document", Producer: "DossierBox PDF renderer", CreationDate: new Date(0) },
      autoFirstPage: false,
      compress: true,
    });
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", () => reject(new PdfRenderError("renderer-failure")));

    pdf.registerFont("regular", regular);
    pdf.registerFont("bold", bold);
    for (const page of pages) {
      pdf.addPage({ size: [model.paper.widthPoints, model.paper.heightPoints], margins: model.margins });
      for (const block of page.blocks) {
        pdf.font(block.bold ? "bold" : "regular").fontSize(block.fontSize).fillColor(block.color);
        block.lines.forEach((line, index) => {
          const bulletIndent = line.bullet ? block.fontSize * 1.25 : 0;
          if (line.bullet) {
            pdf.font("bold").text("•", model.margins.left, block.top + index * block.lineHeight, {
              width: block.fontSize,
              height: block.lineHeight,
              lineBreak: false,
            });
            pdf.font(block.bold ? "bold" : "regular");
          }
          pdf.text(line.text, model.margins.left + bulletIndent, block.top + index * block.lineHeight, {
            width: model.paper.widthPoints - model.margins.left - model.margins.right - bulletIndent,
            height: block.lineHeight,
            lineBreak: false,
            underline: block.source.kind === "link",
            link: block.source.kind === "link" ? block.source.url : undefined,
          });
        });
      }
    }
    pdf.end();
  });
}

export class PdfRenderError extends Error {
  constructor(readonly reason: "resource-limit" | "font-unavailable" | "renderer-failure") {
    super(`PDF rendering failed: ${reason}`);
    this.name = "PdfRenderError";
  }
}
