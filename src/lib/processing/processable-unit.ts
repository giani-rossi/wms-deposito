import { receivedUnitRequiresProcessing } from "@/lib/constants";
import type { ReceivedUnitType } from "@/lib/types/database";

export type ProcessableUnitContent = {
  product_id: string;
  name: string;
  sku: string | null;
  unit_of_measure: string | null;
  quantity: number;
};

export type ProcessableUnit = {
  id: string;
  code: string;
  display_label: string | null;
  type: ReceivedUnitType;
  inbound_order_id: string;
  clientName: string;
  orderLabel: string;
  physical_quantity: number;
  flagLabels: string[];
  hasContent: boolean;
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
  contents: ProcessableUnitContent[];
};

export function processingFlagLabels(u: {
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
}): string[] {
  const labels: string[] = [];
  if (u.requires_classification) labels.push("Clasificación");
  if (u.requires_desconsolidation) labels.push("Desconsolidación");
  if (u.requires_assembly) labels.push("Armado");
  if (u.requires_repackaging) labels.push("Reembalaje");
  return labels;
}

export function canShowProcessButton(
  u: {
    processed_at: string | null;
    requires_classification: boolean;
    requires_desconsolidation: boolean;
    requires_assembly: boolean;
    requires_repackaging: boolean;
  },
  locatedQty: number
): boolean {
  return (
    receivedUnitRequiresProcessing(u) &&
    u.processed_at == null &&
    locatedQty === 0
  );
}

export function buildProcessableUnit(params: {
  unit: {
    id: string;
    code: string;
    display_label: string | null;
    type: ReceivedUnitType;
    inbound_order_id: string;
    physical_quantity: number;
    requires_classification: boolean;
    requires_desconsolidation: boolean;
    requires_assembly: boolean;
    requires_repackaging: boolean;
  };
  clientName: string;
  orderLabel: string;
  contents: ProcessableUnitContent[];
}): ProcessableUnit {
  const { unit, clientName, orderLabel, contents } = params;
  return {
    id: unit.id,
    code: unit.code,
    display_label: unit.display_label,
    type: unit.type,
    inbound_order_id: unit.inbound_order_id,
    clientName,
    orderLabel,
    physical_quantity: Number(unit.physical_quantity),
    flagLabels: processingFlagLabels(unit),
    hasContent: contents.length > 0,
    requires_classification: unit.requires_classification,
    requires_desconsolidation: unit.requires_desconsolidation,
    requires_assembly: unit.requires_assembly,
    requires_repackaging: unit.requires_repackaging,
    contents,
  };
}
