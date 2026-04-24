const LS_KEY = "alfred_selected_model";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getSelectedModel() {
  try { return localStorage.getItem(LS_KEY) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}

export function setSelectedModel(id) {
  try { localStorage.setItem(LS_KEY, id); } catch {}
}
