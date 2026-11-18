export const APP_NAME = "DeepChat";
export const APP_TAGLINE = "科研个人助理与课题组协作";

// Electron derives its data directory from package.name at startup. Capture it
// before setting the visible name, including an explicit --user-data-dir, so a
// display-name change never moves existing accounts, settings or local files.
export function applyDesktopBrand(app: {
  getPath(name: "userData"): string;
  setName(name: string): void;
  setPath(name: "userData", value: string): void;
}) {
  const userData = app.getPath("userData");
  app.setName(APP_NAME);
  app.setPath("userData", userData);
}
