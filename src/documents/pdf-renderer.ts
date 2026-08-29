import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PresentationModel } from "./export-presentation";

const FONT_ROOT = join(process.cwd(), "node_modules", "@fontsource", "open-sans", "files");
const MAX_BLOCKS = 10_000;

export async function renderPresentationPdf(model: PresentationModel): Promise<Buffer> {
  if (model.blocks.length > MAX_BLOCKS) throw new PdfRenderError("resource-limit");
  const regular = join(FONT_ROOT, model.typography.regularFont);
  const bold = join(FONT_ROOT, model.typography.boldFont);
  if (!existsSync(regular) || !existsSync(bold)) throw new PdfRenderError("font-unavailable");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({
      size: [model.paper.widthPoints, model.paper.heightPoints],
      margins: model.margins,
      info: { Title: "DossierBox document", Producer: "DossierBox PDF renderer", CreationDate: new Date(0) },
      autoFirstPage: true,
      compress: true,
    });
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", () => reject(new PdfRenderError("renderer-failure")));

    pdf.registerFont("regular", regular);
    pdf.registerFont("bold", bold);
    pdf.fillColor(model.colors.ink);
    for (const block of model.blocks) {
      if (block.kind === "link") {
        pdf.font("regular").fontSize(model.typography.bodySize).fillColor(model.colors.accent).text(block.text, { link: block.url, underline: true, paragraphGap: model.spacing.paragraphAfter });
        pdf.fillColor(model.colors.ink);
        continue;
      }
      if (block.kind === "bullet") {
        pdf.font("regular").fontSize(model.typography.bodySize).fillColor(model.colors.ink).text(`• ${block.text}`, { paragraphGap: model.spacing.paragraphAfter, lineGap: model.typography.bodySize * (model.typography.lineHeight - 1) });
        continue;
      }
      const isHeading = block.role === "heading";
      const isName = block.role === "name";
      pdf.font(block.bold || isHeading || isName ? "bold" : "regular").fontSize(isName ? model.typography.nameSize : isHeading ? model.typography.headingSize : model.typography.bodySize).fillColor(isName ? model.colors.accent : block.role === "meta" ? model.colors.muted : model.colors.ink);
      pdf.text(block.text, { paragraphGap: isHeading ? model.spacing.sectionAfter : block.role === "body" ? model.spacing.paragraphAfter : 2, lineGap: model.typography.bodySize * (model.typography.lineHeight - 1) });
      if (isHeading) pdf.moveDown(model.spacing.sectionBefore / model.typography.bodySize);
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
