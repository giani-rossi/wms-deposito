import { describe, expect, it } from "vitest";
import { classifyMoveDestination } from "@/lib/movements/classify-move-destination";

const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("classifyMoveDestination", () => {
  it("assigned_same_client: sin override, sin warning obligatorio", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R1-A-1",
        status: "free",
        assigned_client_id: CLIENT_A,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [],
      getClientName: () => "Cliente A",
    });

    expect(result.kind).toBe("assigned_same_client");
    expect(result.requiresOverride).toBe(false);
    expect(result.requiresNote).toBe(false);
    expect(result.warningMessage).toBeNull();
    expect(result.optionLabel).toContain("R1-A-1");
    expect(result.optionLabel).toContain("Cliente A");
  });

  it("unassigned_free: warning de posición sin asignar", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R2-B-2",
        status: "free",
        assigned_client_id: null,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [],
    });

    expect(result.kind).toBe("unassigned_free");
    expect(result.requiresOverride).toBe(false);
    expect(result.requiresNote).toBe(false);
    expect(result.warningMessage).toBe(
      "Esta posición no está asignada al cliente."
    );
    expect(result.optionLabel).toContain("Sin asignar");
  });

  it("same_client_occupied: mismo cliente ya presente", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R1-C-1",
        status: "partially_occupied",
        assigned_client_id: null,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [CLIENT_A],
    });

    expect(result.kind).toBe("same_client_occupied");
    expect(result.requiresOverride).toBe(false);
    expect(result.requiresNote).toBe(false);
    expect(result.warningMessage).toBe(
      "La posición ya contiene mercadería de este cliente."
    );
    expect(result.optionLabel).toContain("Mismo cliente");
  });

  it("occupied_other_client: exige override y nota", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R1-D-1",
        status: "partially_occupied",
        assigned_client_id: null,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [CLIENT_B],
    });

    expect(result.kind).toBe("occupied_other_client");
    expect(result.requiresOverride).toBe(true);
    expect(result.requiresNote).toBe(true);
    expect(result.warningMessage).toBe(
      "La posición destino contiene mercadería de otro cliente."
    );
    expect(result.overrideNoteFragments).toContain(
      "Override: mercadería de otro cliente en destino"
    );
  });

  it("assigned_other_client: exige override y nota", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R2-A-1",
        status: "free",
        assigned_client_id: CLIENT_B,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [],
    });

    expect(result.kind).toBe("assigned_other_client");
    expect(result.requiresOverride).toBe(true);
    expect(result.requiresNote).toBe(true);
    expect(result.warningMessage).toBe(
      "La posición destino está asignada a otro cliente."
    );
    expect(result.optionLabel).toContain("Asignada a otro cliente");
  });

  it("blocked_or_incident: prioriza bloqueo sobre otras señales", () => {
    const result = classifyMoveDestination({
      position: {
        code: "R1-A-2",
        status: "incident",
        assigned_client_id: CLIENT_B,
      },
      unitClientId: CLIENT_A,
      occupantClientIds: [CLIENT_B],
    });

    expect(result.kind).toBe("blocked_or_incident");
    expect(result.requiresOverride).toBe(true);
    expect(result.requiresNote).toBe(true);
    expect(result.warningMessage).toBe(
      "La posición destino está bloqueada o en revisión."
    );
    expect(result.overrideNoteFragments).toContain(
      "Override: destino bloqueado/en revisión"
    );
  });
});
