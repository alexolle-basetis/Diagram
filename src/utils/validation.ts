import type { DiagramData, ValidationError } from "../types/diagram";

const VALID_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function validateDiagram(diagram: DiagramData): ValidationError[] {
  const errors: ValidationError[] = [];
  const screenIds = new Set(diagram.screens.map((s) => s.id));
  const actionIds = new Set<string>();

  // Check screens
  const seenScreenIds = new Set<string>();
  diagram.screens.forEach((screen, i) => {
    if (!screen.id) {
      errors.push({ type: "error", message: `Screen [${i}] no tiene id`, path: `screens[${i}].id` });
    }
    if (seenScreenIds.has(screen.id)) {
      errors.push({ type: "error", message: `ID de screen duplicado: "${screen.id}"`, path: `screens[${i}].id` });
    }
    seenScreenIds.add(screen.id);

    if (!screen.title) {
      errors.push({ type: "warning", message: `Screen "${screen.id}" no tiene título`, path: `screens[${i}].title` });
    }

    screen.actions.forEach((action, j) => {
      if (!action.id) {
        errors.push({ type: "error", message: `Acción [${j}] en "${screen.id}" no tiene id`, path: `screens[${i}].actions[${j}].id` });
      }
      if (actionIds.has(action.id)) {
        errors.push({ type: "error", message: `ID de acción duplicado: "${action.id}"`, path: `screens[${i}].actions[${j}].id` });
      }
      actionIds.add(action.id);

      if (!screenIds.has(action.targetScreen)) {
        errors.push({
          type: "error",
          message: `Acción "${action.id}" apunta a screen inexistente: "${action.targetScreen}"`,
          path: `screens[${i}].actions[${j}].targetScreen`,
        });
      }
      if (action.errorTargetScreen && !screenIds.has(action.errorTargetScreen)) {
        errors.push({
          type: "error",
          message: `Acción "${action.id}" error-target apunta a screen inexistente: "${action.errorTargetScreen}"`,
          path: `screens[${i}].actions[${j}].errorTargetScreen`,
        });
      }
    });
  });

  // Check API calls
  diagram.apiCalls.forEach((api, i) => {
    if (!actionIds.has(api.actionId)) {
      errors.push({
        type: "warning",
        message: `apiCall [${i}] referencia acción inexistente: "${api.actionId}"`,
        path: `apiCalls[${i}].actionId`,
      });
    }
    if (api.method && !VALID_METHODS.includes(api.method.toUpperCase())) {
      errors.push({
        type: "warning",
        message: `Método HTTP no estándar: "${api.method}"`,
        path: `apiCalls[${i}].method`,
      });
    }
    if (!api.endpoint) {
      errors.push({
        type: "warning",
        message: `apiCall para "${api.actionId}" no tiene endpoint`,
        path: `apiCalls[${i}].endpoint`,
      });
    }
  });

  return errors;
}
