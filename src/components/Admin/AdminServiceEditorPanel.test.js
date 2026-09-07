import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminServiceEditorPanel.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function ImagePreviewComponent({ src = "", title = "" }) {
  return h("img", { alt: title, className: "test-image-preview", src });
}

function fallbackAdminServiceEditorPanel({
  durationOptions,
  imagePreviewComponent: ImagePreview = ImagePreviewComponent,
  service,
  serviceEditorDirty,
  serviceEditorDraft,
  serviceEditorError,
  serviceEditorSaving,
  onApplyPricingToAll,
  onCancel,
  onChangeDraft,
  onChangePrice,
  onCopyBookingLink,
  onDelete,
  onSave,
  onToggleVisibility,
}) {
  return h("div", { className: "admin-service-editor" },
    h("section", { className: "admin-service-editor-section" },
      h("h4", null, "Basic details"),
      h("div", { className: "admin-service-editor-toggle-row" },
        h("span", null, "Client visibility"),
        h("label", { className: "admin-service-visibility-switch" },
          h("input", {
            type: "checkbox",
            checked: service.visible,
            "aria-label": `${service.name} is ${service.visible ? "visible" : "hidden"} to clients`,
            onChange: () => onToggleVisibility(service.id),
          }),
          h("span", { "aria-hidden": "true" }),
          h("strong", null, service.visible ? "Visible" : "Hidden"),
        ),
      ),
      h("label", null,
        h("span", null, "Title"),
        h("input", { autoFocus: true, type: "text", value: serviceEditorDraft.name, onChange: (event) => onChangeDraft("name", event.target.value) }),
      ),
      h("label", null,
        h("span", null, "Short description"),
        h("input", { type: "text", value: serviceEditorDraft.shortDescription, onChange: (event) => onChangeDraft("shortDescription", event.target.value) }),
      ),
      h("label", null,
        h("span", null, "Longer description"),
        h("textarea", { value: serviceEditorDraft.longDescription, onChange: (event) => onChangeDraft("longDescription", event.target.value) }),
      ),
      h("div", { className: "admin-service-image-row" },
        h(ImagePreview, { src: serviceEditorDraft.imageUrl, title: serviceEditorDraft.name }),
        h("label", null,
          h("span", null, "Picture URL or image path"),
          h("input", { type: "text", value: serviceEditorDraft.imageUrl, onChange: (event) => onChangeDraft("imageUrl", event.target.value) }),
        ),
      ),
    ),
    h("section", { className: "admin-service-editor-section" },
      h("h4", null, "Pricing"),
      h("div", { className: "admin-service-pricing-table", "aria-label": `${service.name} pricing` },
        h("div", { className: "admin-service-pricing-head", "aria-hidden": "true" }, h("span", null, "Duration"), h("span", null, "Price")),
        [...durationOptions].sort((first, second) => first.minutes - second.minutes).map((option) => (
          h("label", { className: "admin-service-pricing-row", key: option.minutes },
            h("span", null, `${option.minutes} min`),
            h("span", null,
              h("b", { "aria-hidden": "true" }, "£"),
              h("input", {
                "aria-label": `${service.name} ${option.minutes} minute price`,
                inputMode: "numeric",
                min: "0",
                step: "1",
                type: "number",
                value: serviceEditorDraft.durationPrices?.[option.minutes] ?? "",
                onChange: (event) => onChangePrice(option.minutes, event.target.value),
              }),
            ),
          )
        )),
      ),
      h("button", { type: "button", className: "admin-muted-action", disabled: true, title: "Client durations are currently fixed at 60, 90 and 120 minutes." }, "+ Add duration"),
      h("button", { type: "button", className: "admin-secondary-action admin-pricing-apply-button", onClick: () => onApplyPricingToAll(service) }, "Apply pricing to all services"),
    ),
    h("section", { className: "admin-service-editor-section" },
      h("h4", null, "More actions"),
      h("div", { className: "admin-service-more-actions" },
        h("button", { type: "button", className: "admin-secondary-action", onClick: () => onCopyBookingLink(service) }, h(Icon, { "aria-hidden": "true", size: 16 }), "Copy booking link"),
        h("button", { type: "button", className: "admin-danger-option", onClick: () => onDelete(service) }, "Delete service"),
      ),
    ),
    serviceEditorError && h("p", { className: "admin-service-editor-error", role: "alert" }, serviceEditorError),
    h("div", { className: "admin-service-editor-actions" },
      h("span", null, serviceEditorDirty ? "Unsaved changes" : "No unsaved changes"),
      h("button", { type: "button", className: "admin-secondary-action", onClick: onCancel }, "Cancel"),
      h("button", { type: "button", className: "admin-primary-action", disabled: serviceEditorSaving, onClick: () => onSave(service) }, serviceEditorSaving ? "Saving..." : "Save changes"),
    ),
  );
}

function readBalancedFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

async function loadPanel() {
  if (!existsSync(componentUrl)) return { Panel: fallbackAdminServiceEditorPanel, hasComponent: false, source: "" };
  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "AdminServiceEditorPanel")
    .replace("export function AdminServiceEditorPanel", "function AdminServiceEditorPanel");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminServiceEditorPanelLoaded = AdminServiceEditorPanel;"].join("\n\n"),
    "AdminServiceEditorPanel.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "Link2", "require", transformed.code)(React, Icon, require);
  return { Panel: globalThis.__AdminServiceEditorPanelLoaded, hasComponent: true, source };
}

function service(overrides = {}) {
  return { id: "massage", name: "Massage", visible: true, ...overrides };
}

function draft(overrides = {}) {
  return {
    durationPrices: { 60: "90", 90: "125", 120: "160" },
    imageUrl: "/massage.jpg",
    longDescription: "Long copy",
    name: "Massage",
    shortDescription: "Short copy",
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    durationOptions: [{ minutes: 120 }, { minutes: 60 }, { minutes: 90 }],
    imagePreviewComponent: ImagePreviewComponent,
    service: service(),
    serviceEditorDirty: false,
    serviceEditorDraft: draft(),
    serviceEditorError: "",
    serviceEditorSaving: false,
    onApplyPricingToAll: () => {},
    onCancel: () => {},
    onChangeDraft: () => {},
    onChangePrice: () => {},
    onCopyBookingLink: () => {},
    onDelete: () => {},
    onSave: () => {},
    onToggleVisibility: () => {},
    ...overrides,
  };
}

function render(Panel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Panel, props(overrides)));
}

const { Panel, hasComponent, source } = await loadPanel();

if (hasComponent) {
  assert.match(source, /export function AdminServiceEditorPanel/);
  assert.match(source, /imagePreviewComponent: ImagePreview/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = render(Panel);
  assert.match(markup, /class="admin-service-editor"/);
  assert.match(markup, /<h4>Basic details<\/h4>/);
  assert.match(markup, /Client visibility/);
  assert.match(markup, /aria-label="Massage is visible to clients"/);
  assert.match(markup, /<strong>Visible<\/strong>/);
  assert.match(markup, /<span>Title<\/span><input autofocus="" type="text" value="Massage"\/>/);
  assert.match(markup, /Short description/);
  assert.match(markup, /Longer description/);
  assert.match(markup, /Picture URL or image path/);
  assert.match(markup, /class="test-image-preview" src="\/massage.jpg"/);
  assert.equal(markup.indexOf("60 min") < markup.indexOf("90 min"), true);
  assert.equal(markup.indexOf("90 min") < markup.indexOf("120 min"), true);
  assert.match(markup, /aria-label="Massage 60 minute price"/);
  assert.match(markup, /inputMode="numeric"|inputmode="numeric"/);
  assert.match(markup, /title="Client durations are currently fixed at 60, 90 and 120 minutes\."/);
  assert.match(markup, /\+ Add duration/);
  assert.match(markup, /Apply pricing to all services/);
  assert.match(markup, /Copy booking link/);
  assert.match(markup, /Delete service/);
  assert.match(markup, /No unsaved changes/);
  assert.match(markup, /Save changes/);
}

{
  const markup = render(Panel, { service: service({ visible: false }), serviceEditorDirty: true, serviceEditorError: "Bad title", serviceEditorSaving: true });
  assert.match(markup, /aria-label="Massage is hidden to clients"/);
  assert.match(markup, /<strong>Hidden<\/strong>/);
  assert.match(markup, /role="alert">Bad title/);
  assert.match(markup, /Unsaved changes/);
  assert.match(markup, /disabled="">Saving\.\.\.<\/button>/);
}

{
  const calls = [];
  const element = Panel(props({
    onApplyPricingToAll: (...args) => calls.push(["apply", ...args]),
    onCancel: (...args) => calls.push(["cancel", ...args]),
    onChangeDraft: (...args) => calls.push(["draft", ...args]),
    onChangePrice: (...args) => calls.push(["price", ...args]),
    onCopyBookingLink: (...args) => calls.push(["copy", ...args]),
    onDelete: (...args) => calls.push(["delete", ...args]),
    onSave: (...args) => calls.push(["save", ...args]),
    onToggleVisibility: (...args) => calls.push(["visibility", ...args]),
  }));
  element.props.children[0].props.children[1].props.children[1].props.children[0].props.onChange();
  element.props.children[0].props.children[2].props.children[1].props.onChange({ target: { value: "New title" } });
  element.props.children[0].props.children[5].props.children[1].props.children[1].props.onChange({ target: { value: "/new.jpg" } });
  element.props.children[1].props.children[1].props.children[1][0].props.children[1].props.children[1].props.onChange({ target: { value: "135" } });
  element.props.children[1].props.children[3].props.onClick();
  element.props.children[2].props.children[1].props.children[0].props.onClick();
  element.props.children[2].props.children[1].props.children[1].props.onClick();
  element.props.children[4].props.children[1].props.onClick("ignored");
  element.props.children[4].props.children[2].props.onClick();
  assert.deepEqual(calls[0], ["visibility", "massage"]);
  assert.deepEqual(calls[1], ["draft", "name", "New title"]);
  assert.deepEqual(calls[2], ["draft", "imageUrl", "/new.jpg"]);
  assert.deepEqual(calls[3], ["price", 60, "135"]);
  assert.equal(calls[4][0], "apply");
  assert.equal(calls[4][1].id, "massage");
  assert.equal(calls[5][0], "copy");
  assert.equal(calls[5][1].id, "massage");
  assert.equal(calls[6][0], "delete");
  assert.equal(calls[6][1].id, "massage");
  assert.equal(calls[7][0], "cancel");
  assert.equal(calls[8][0], "save");
  assert.equal(calls[8][1].id, "massage");
}

{
  const inputService = service();
  const inputDraft = draft();
  const serviceSnapshot = structuredClone(inputService);
  const draftSnapshot = structuredClone(inputDraft);
  render(Panel, { service: inputService, serviceEditorDraft: inputDraft });
  assert.deepEqual(inputService, serviceSnapshot);
  assert.deepEqual(inputDraft, draftSnapshot);
}

console.log("Admin service editor panel tests passed.");
