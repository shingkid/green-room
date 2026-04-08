import { expect, test } from "@playwright/test";

async function gotoApp(page) {
  await page.goto("/green-room/");
}

async function ensureExplorerMode(page) {
  const useRegistryButton = page.getByRole("button", { name: "Use this registry" });
  if (await useRegistryButton.isVisible()) {
    await expect(useRegistryButton).toBeEnabled();
    await useRegistryButton.click();
  }
  await expect(page.getByRole("button", { name: "Edit registry" })).toBeVisible();
}

test("loads explorer shell and main tabs", async ({ page }) => {
  await gotoApp(page);
  await ensureExplorerMode(page);

  await expect(page.getByText("Service Dependency Explorer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dependency Impact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Business Flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Data Lineage" })).toBeVisible();
});

test("can enter editor and return to explorer", async ({ page }) => {
  await gotoApp(page);
  await ensureExplorerMode(page);

  await page.getByRole("button", { name: "Edit registry" }).click();
  await expect(page.getByRole("button", { name: "Back to explorer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this registry" })).toBeVisible();

  await page.getByRole("button", { name: "Use this registry" }).click();
  await expect(page.getByRole("button", { name: "Copy Mermaid" })).toBeVisible();
});

test("impact mode supports service selection and direction toggle", async ({ page }) => {
  await gotoApp(page);
  await ensureExplorerMode(page);

  await page.getByRole("button", { name: "Dependency Impact" }).click();
  await page.getByRole("button", { name: /Select a service/i }).click();
  await page.getByRole("button", { name: "Example UI" }).click();

  await expect(page.getByText("Direct dependencies")).toBeVisible();
  await page.getByRole("button", { name: "Upstream" }).click();
  await expect(page.getByText(/upstream deps/i)).toBeVisible();
});

test("data-flow jump from impact details opens data lineage panel", async ({ page }) => {
  await gotoApp(page);
  await ensureExplorerMode(page);

  await page.getByRole("button", { name: "Dependency Impact" }).click();
  await page.getByRole("button", { name: /Select a service/i }).click();
  await page.getByRole("button", { name: "Example UI" }).click();

  await page.getByText(/Example Data Flow/i).first().click();
  await expect(page.getByRole("button", { name: "Data Lineage" })).toBeVisible();
  await expect(page.getByText("Describe how data moves between services.")).toBeVisible();
});

test("theme toggle updates the shell theme attribute", async ({ page }) => {
  await gotoApp(page);

  const shell = page.locator(".app-shell").first();
  const initialTheme = await shell.getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to/i }).click();
  const nextTheme = await shell.getAttribute("data-theme");

  expect(nextTheme).not.toBe(initialTheme);
});
