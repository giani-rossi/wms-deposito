import "server-only";
import OpenAI from "openai";
import { ocrDataSchema, EMPTY_OCR_DATA, type OcrData } from "@/lib/validation/inbound";

/**
 * Extrae datos estructurados de un remito/documento a partir de una imagen.
 *
 * IMPORTANTE: esta función SOLO devuelve datos extraídos crudos para revisión
 * humana. Nunca crea stock, unidades ni movimientos. El resultado debe
 * confirmarse manualmente antes de operar.
 */
export class OcrError extends Error {}

const OCR_MODEL = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `Sos un asistente de un depósito (WMS) que lee remitos y documentos de ingreso de mercadería.
Extraé los datos del documento y devolvé EXCLUSIVAMENTE un JSON válido con esta forma:
{
  "remito_number": string | null,
  "date": string | null,
  "sender": string | null,
  "transport_company": string | null,
  "driver_name": string | null,
  "license_plate": string | null,
  "notes": string | null,
  "items": [ { "description": string, "quantity": number | null, "unit": string | null, "sku": string | null } ]
}
Reglas:
- Si un dato no aparece, usá null (o [] para items).
- No inventes datos. No agregues claves extra.
- "date" en formato ISO (YYYY-MM-DD) si es posible.
- Respondé solo el JSON, sin texto adicional.`;

export async function extractRemittanceData(
  imageUrl: string
): Promise<OcrData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OcrError(
      "Falta configurar OPENAI_API_KEY. Podés cargar los datos del remito manualmente."
    );
  }

  const client = new OpenAI({ apiKey });

  let content: string | null = null;
  try {
    const response = await client.chat.completions.create({
      model: OCR_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraé los datos estructurados de este remito.",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });
    content = response.choices[0]?.message?.content ?? null;
  } catch (err) {
    throw new OcrError(
      err instanceof Error ? err.message : "Error llamando a OpenAI."
    );
  }

  if (!content) {
    throw new OcrError("OpenAI no devolvió contenido.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new OcrError("La respuesta de OpenAI no es JSON válido.");
  }

  const parsed = ocrDataSchema.safeParse(raw);
  if (!parsed.success) {
    // Devolvemos lo que se pueda + estructura vacía para revisión humana.
    return { ...EMPTY_OCR_DATA, ...(raw as Partial<OcrData>) } as OcrData;
  }
  return parsed.data;
}
