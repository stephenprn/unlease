/**
 * What the tokens of `customCss.ts` paint in each service, written from its own source (the versions
 * named) and checked on its screens in both themes. The rules read only `var(--carnet-*)`, set paint
 * alone (colours, shadows, corners: never a size or a layout), and win by specificity rather than by
 * order, since each service may load styles of its own after them.
 */
import type { CssRules, CssService } from './customCss';

/**
 * Seafile 13 and 14 (seahub 13.0.9 and 14.0.9). Its theme is `data-bs-theme` on <body>: the night's
 * tokens go there and the ground is painted on body (html has no background, so body's reaches the
 * window). Served at /custom-css/, last in <head>, but System Admin loads its bundle after it: every
 * rule starts with `body[data-bs-theme]`, and `!important` stands only where Seafile's own has it.
 */
const SEAFILE = String.raw`
/* 1. Seafile theme variables (seafile-ui.css ":root,[data-bs-theme=light]" and "[data-bs-theme=dark]"). */
body[data-bs-theme] {
  --bs-body-bg: var(--carnet-paper);
  --bs-body-color: var(--carnet-ink);
  --bs-body-secondary-color: var(--carnet-ink-muted);
  --bs-body-secondary-bg: var(--carnet-paper-high);
  --bs-secondary-color: var(--carnet-ink-muted);
  --bs-border-color: var(--carnet-outline);
  --bs-border-secondary-color: var(--carnet-hairline);
  --bs-border-tertiary-color: var(--carnet-hairline);
  --bs-header-bg: transparent;
  --bs-popover-bg: var(--carnet-paper);
  --bs-nav-hover-bg: var(--carnet-veil);
  --bs-nav-active-bg: var(--carnet-action-container);
  --bs-tr-hover-bg: var(--carnet-veil);
  --bs-tr-active-bg: var(--carnet-action-container);
  --bs-hover-bg: var(--carnet-veil);
  --bs-hover-secondary-bg: var(--carnet-veil);
  --bs-hover-tertiary-bg: var(--carnet-veil);
  --bs-bg-color: var(--carnet-veil);
  --bs-bg-secondary-color: var(--carnet-veil);
  --bs-icon-color: var(--carnet-ink-muted);
  --bs-icon-secondary-color: var(--carnet-ink-muted);
  --bs-icon-hover-color: var(--carnet-ink);
  --bs-placeholder-color: var(--carnet-ink-faint);
  --bs-link-color: var(--carnet-link);
  --bs-link-hover-color: var(--carnet-link);
  --bs-highlight-bg: var(--carnet-highlight);
  --bs-primary: var(--carnet-action);
  /* 14's glow around a focused check box or select */
  --bs-form-select-focus-box-shadow: 0 0 0 2px var(--carnet-focus);
  /* the page ground; html has no background, so this one also paints the canvas and overscroll */
  background: var(--carnet-ground);
  color: var(--carnet-ink);
  accent-color: var(--carnet-focus);
}
body[data-bs-theme] ::selection {
  background-color: var(--carnet-highlight);
  color: var(--carnet-ink);
}

/* 1b. Secondary text: Bootstrap/Tabler utilities hold fixed greys, with !important (seafile-ui.css .text-secondary,
   .text-muted, .text-gray), unreadable on the night paper */
body[data-bs-theme] .text-secondary,
body[data-bs-theme] .text-muted,
body[data-bs-theme] .text-gray {
  color: var(--carnet-ink-muted) !important;
}
/* hints in dialogs and forms: .form-text (seafile-ui.css) and .tip (#666 from file-view.css, bundled in commons) */
body[data-bs-theme] .form-text,
body[data-bs-theme] .tip {
  color: var(--carnet-ink-muted);
}

/* 2. Links. Same selectors as Seafile's "a,a:hover{color:#ed7109}" so class rules keep winning. */
a,
a:hover {
  color: var(--carnet-link);
}
/* Seafile sets these with !important */
body[data-bs-theme] .sf-link,
body[data-bs-theme] .path-link {
  color: var(--carnet-link) !important;
}
/* the item a dialog title names ("Share <name>", "Delete <name>"): seahub_react.css .op-target is the orange literal */
body[data-bs-theme] .op-target {
  color: var(--carnet-link);
}
/* ties with a:hover that Seafile resolved by order */
body[data-bs-theme] a.table-sort-op:hover {
  color: inherit;
}
body[data-bs-theme] .file-info a:hover {
  color: var(--carnet-ink);
}

/* 3. Top header and side panel lie on the ground: the same fixed gradient, so it meets the body's seamlessly
   (and the phone drawer, position:fixed over the list, stays opaque). */
body[data-bs-theme] .top-header,
body[data-bs-theme] .side-panel-north,
body[data-bs-theme] .main-panel-north,
body[data-bs-theme] .side-panel {
  background: var(--carnet-ground);
}
body[data-bs-theme] .side-panel .side-nav .side-nav-con .nav-item {
  background: transparent;
}
body[data-bs-theme] .side-panel .nav-pills .nav-item .nav-link.active,
body[data-bs-theme] .side-panel .nav-pills .nav-item .nav-link.active:hover {
  background-color: var(--carnet-action-container);
  color: var(--carnet-on-action-container);
}
body[data-bs-theme] .side-panel .side-nav-con .active > .nav-link [class^="sf3-font-"],
body[data-bs-theme] .side-panel .side-nav-con .active > .nav-link [class^="sf2-icon-"],
body[data-bs-theme] .side-panel .side-nav-con .active > .nav-link .seafile-multicolor-icon,
body[data-bs-theme] .side-panel .side-nav-con .active > .nav-link .nav-icon {
  color: var(--carnet-on-action-container);
}
/* the unread count on the bell: Seafile's red-orange badge takes the accent */
body[data-bs-theme] #notifications .num {
  background: var(--carnet-action);
  color: var(--carnet-on-action);
}
/* the current folder in the library tree lies on the PRIMARY wash (--bs-nav-active-bg): its own ink */
body[data-bs-theme] .tree-node-hight-light,
body[data-bs-theme] .tree-node-hight-light .tree-node-icon,
body[data-bs-theme] .tree-node-hight-light .folder-toggle-icon {
  color: var(--carnet-on-action-container);
}
/* the selected edge: the active nav item and the current folder in the library tree */
body[data-bs-theme] .side-panel .side-nav .side-nav-con .nav-item.active::before,
body[data-bs-theme] .tree-node-hight-light::before,
body[data-bs-theme] .dir-others .dir-others-item.tree-node-hight-light::before {
  background-color: var(--carnet-focus);
}

/* 4. Lists: hover is a veil, a selected row is the PRIMARY wash with its own ink. */
body[data-bs-theme] .tr-active a,
body[data-bs-theme] .tr-active td,
body[data-bs-theme] .tr-active .op-icon {
  color: var(--carnet-on-action-container);
}
body[data-bs-theme] .tr-active .sf-link {
  color: var(--carnet-on-action-container) !important;
}
body[data-bs-theme] .sf-dropdown-toggle {
  color: var(--carnet-ink-muted);
}

/* 5. Buttons. */
body[data-bs-theme] .btn {
  --bs-btn-focus-box-shadow: 0 0 0 2px var(--carnet-focus);
}
body[data-bs-theme] .btn-primary {
  --bs-btn-color: var(--carnet-on-action);
  --bs-btn-bg: var(--carnet-action);
  --bs-btn-border-color: var(--carnet-action);
  --bs-btn-hover-color: var(--carnet-on-action);
  --bs-btn-hover-bg: var(--carnet-action);
  --bs-btn-hover-border-color: var(--carnet-action);
  --bs-btn-active-color: var(--carnet-on-action);
  --bs-btn-active-bg: var(--carnet-action);
  --bs-btn-active-border-color: var(--carnet-action);
  --bs-btn-disabled-color: var(--carnet-on-action);
  --bs-btn-disabled-bg: var(--carnet-action);
  --bs-btn-disabled-border-color: var(--carnet-action);
}
/* seafile-ui.css ends with literal-orange states for every .btn: give each its variant's colours back */
body[data-bs-theme] .btn.active,
body[data-bs-theme] .btn.show,
body[data-bs-theme] .btn:first-child:active,
body[data-bs-theme] :not(.btn-check) + .btn:active {
  background-color: var(--bs-btn-active-bg, var(--carnet-veil));
  border-color: var(--bs-btn-active-border-color, transparent);
  color: var(--bs-btn-active-color, currentColor);
}
body[data-bs-theme] .btn.btn-primary:hover,
body[data-bs-theme] .btn.btn-primary:active {
  background-color: var(--carnet-action);
  border-color: var(--carnet-action);
  color: var(--carnet-on-action);
}
body[data-bs-theme] .btn-primary:hover,
body[data-bs-theme] .btn-primary:active,
body[data-bs-theme] .btn-primary:focus-visible {
  background-image: linear-gradient(var(--carnet-veil), var(--carnet-veil));
}
body[data-bs-theme] .btn-secondary {
  --bs-btn-color: var(--carnet-ink);
  --bs-btn-bg: var(--carnet-paper);
  --bs-btn-border-color: var(--carnet-outline);
  --bs-btn-hover-color: var(--carnet-ink);
  --bs-btn-hover-bg: var(--carnet-paper-high);
  --bs-btn-hover-border-color: var(--carnet-outline);
  --bs-btn-active-color: var(--carnet-ink);
  --bs-btn-active-bg: var(--carnet-paper-high);
  --bs-btn-active-border-color: var(--carnet-outline);
  --bs-btn-disabled-color: var(--carnet-ink-faint);
  --bs-btn-disabled-bg: var(--carnet-paper);
  --bs-btn-disabled-border-color: var(--carnet-outline);
}
body[data-bs-theme] .btn.btn-secondary:hover,
body[data-bs-theme] .btn.btn-secondary:active {
  background-color: var(--carnet-paper-high);
  border-color: var(--carnet-outline);
  color: var(--carnet-ink);
}
body[data-bs-theme] .btn-outline-primary {
  --bs-btn-color: var(--carnet-link);
  --bs-btn-bg: transparent;
  --bs-btn-disabled-bg: transparent;
  --bs-btn-border-color: var(--carnet-action);
  --bs-btn-hover-color: var(--carnet-on-action);
  --bs-btn-hover-bg: var(--carnet-action);
  --bs-btn-hover-border-color: var(--carnet-action);
  --bs-btn-active-color: var(--carnet-on-action);
  --bs-btn-active-bg: var(--carnet-action);
  --bs-btn-active-border-color: var(--carnet-action);
  --bs-btn-disabled-color: var(--carnet-link);
  --bs-btn-disabled-border-color: var(--carnet-action);
}
body[data-bs-theme] .btn-outline-primary:hover,
body[data-bs-theme] .btn-outline-primary:active {
  background-color: var(--carnet-action);
  border-color: var(--carnet-action);
  color: var(--carnet-on-action);
}
body[data-bs-theme] .btn-primary,
body[data-bs-theme] .btn-secondary,
body[data-bs-theme] .btn-outline-primary {
  border-radius: var(--carnet-radius-control);
}

/* 6. Fields: text on --carnet-field, an edge you can see, the PRIMARY focus ring. A native select
   (.form-select) is recoloured by day only: its arrow is a dark data-URL image that Seafile keeps on a white
   field at night, and a night field would hide it. */
body[data-bs-theme] .form-control,
body[data-bs-theme] .custom-select,
body[data-bs-theme] .search-input,
body[data-bs-theme] .rename-container input,
body[data-bs-theme="light"] .form-select {
  background-color: var(--carnet-field);
  border-color: var(--carnet-edge);
  color: var(--carnet-ink);
  border-radius: var(--carnet-radius-control);
}
body[data-bs-theme] .form-control:focus,
body[data-bs-theme] .search-input:focus,
body[data-bs-theme] .rename-container input:focus,
body[data-bs-theme="light"] .form-select:focus {
  background-color: var(--carnet-field);
  border-color: var(--carnet-focus);
  box-shadow: 0 0 0 1px var(--carnet-focus);
  color: var(--carnet-ink);
}
body[data-bs-theme] .form-control::placeholder {
  color: var(--carnet-ink-faint);
}
body[data-bs-theme] .form-control:disabled {
  background-color: var(--carnet-paper-high);
  color: var(--carnet-ink-muted);
}
body[data-bs-theme] .input-group-text {
  background-color: var(--carnet-paper-high);
  border-color: var(--carnet-edge);
  color: var(--carnet-ink-muted);
}
/* switches: OFF is an edge-coloured knob in the well, ON a paper knob on the PRIMARY deep track */
body[data-bs-theme] .custom-switch-indicator {
  background: var(--carnet-paper-high);
  border-color: var(--carnet-edge);
}
body[data-bs-theme] .custom-switch-indicator::before {
  background: var(--carnet-edge);
}
body[data-bs-theme] .custom-switch-input:checked ~ .custom-switch-indicator {
  background: var(--carnet-focus);
  border-color: var(--carnet-focus);
}
body[data-bs-theme] .custom-switch-input:checked ~ .custom-switch-indicator::before {
  background: var(--carnet-paper);
}
body[data-bs-theme] .custom-switch-input:focus ~ .custom-switch-indicator {
  border-color: var(--carnet-focus);
  box-shadow: 0 0 0 2px var(--carnet-focus);
}
body[data-bs-theme] .custom-switch-description {
  color: var(--carnet-ink);
}

/* 7. Menus and popovers: paper, lifted. */
body[data-bs-theme] .dropdown-menu {
  --bs-dropdown-bg: var(--carnet-paper);
  --bs-dropdown-color: var(--carnet-ink);
  --bs-dropdown-border-color: var(--carnet-outline);
  --bs-dropdown-divider-bg: var(--carnet-hairline);
  --bs-dropdown-link-color: var(--carnet-ink);
  --bs-dropdown-link-hover-color: var(--carnet-ink);
  --bs-dropdown-link-hover-bg: var(--carnet-veil);
  --bs-dropdown-link-active-color: var(--carnet-on-action-container);
  --bs-dropdown-link-active-bg: var(--carnet-action-container);
  --bs-dropdown-link-disabled-color: var(--carnet-ink-faint);
  --bs-dropdown-header-color: var(--carnet-ink-muted);
  background-color: var(--carnet-paper);
  border-color: var(--carnet-outline);
  color: var(--carnet-ink);
  box-shadow: var(--carnet-lift-float);
  border-radius: var(--carnet-radius-menu);
}
body[data-bs-theme] .dropdown-item {
  color: var(--carnet-ink);
}
body[data-bs-theme] .dropdown-item:hover,
body[data-bs-theme] .dropdown-item:focus {
  background-color: var(--carnet-veil);
  color: var(--carnet-ink);
}
body[data-bs-theme] .dropdown-item.active,
body[data-bs-theme] .dropdown-item:active {
  background-color: var(--carnet-action-container);
  color: var(--carnet-on-action-container);
}
body[data-bs-theme] .dropdown-item .sf3-font,
body[data-bs-theme] .dropdown-item .sf2-icon-tick,
body[data-bs-theme] .dropdown-item .dropdown-item-icon,
body[data-bs-theme] .dropdown-item:hover .sf3-font,
body[data-bs-theme] .dropdown-item:hover .dropdown-item-icon,
body[data-bs-theme] .dropdown-item:focus .dropdown-item-icon,
body[data-bs-theme] .dropdown-item:hover .sf2-icon-tick,
body[data-bs-theme] .dropdown-item:focus .sf2-icon-tick {
  color: var(--carnet-ink-muted);
}
body[data-bs-theme] .dropdown-item.active .sf3-font,
body[data-bs-theme] .dropdown-item.active .dropdown-item-icon,
body[data-bs-theme] .dropdown-item:active .dropdown-item-icon {
  color: var(--carnet-on-action-container);
}
body[data-bs-theme] .dropdown-divider {
  border-color: var(--carnet-hairline);
}
body[data-bs-theme] .popover {
  --bs-popover-bg: var(--carnet-paper);
  --bs-popover-border-color: var(--carnet-outline);
  --bs-popover-header-bg: var(--carnet-paper-high);
  --bs-popover-header-color: var(--carnet-ink);
  --bs-popover-body-color: var(--carnet-ink);
  border-radius: var(--carnet-radius-menu);
}
body[data-bs-theme] .sf-popover {
  background: var(--carnet-paper);
  border-color: var(--carnet-outline);
  box-shadow: var(--carnet-lift-float);
  border-radius: var(--carnet-radius-menu);
}

/* 8. Dialogs. */
body[data-bs-theme] .modal {
  --bs-modal-bg: var(--carnet-paper);
  --bs-modal-color: var(--carnet-ink);
  --bs-modal-border-color: var(--carnet-outline);
  --bs-modal-header-border-color: var(--carnet-hairline);
  --bs-modal-footer-border-color: var(--carnet-hairline);
  --bs-modal-border-radius: var(--carnet-radius-dialog);
  --bs-modal-inner-border-radius: var(--carnet-radius-dialog);
  --bs-modal-box-shadow: var(--carnet-lift-float);
}
body[data-bs-theme] .modal-content {
  box-shadow: var(--carnet-lift-float);
}
body[data-bs-theme] .modal-backdrop {
  --bs-backdrop-bg: var(--carnet-scrim);
  --bs-backdrop-opacity: 1;
}

/* 9. Tabs and pills: the chosen tab carries the PRIMARY deep colour, a chosen pill the PRIMARY wash. */
body[data-bs-theme] .nav:not(.nav-pills) .nav-item .nav-link.active {
  color: var(--carnet-focus);
  border-bottom-color: var(--carnet-focus);
}
body[data-bs-theme] .nav-indicator-container::before {
  background: var(--carnet-focus);
}
body[data-bs-theme] .nav-pills .nav-item .nav-link.active {
  background-color: var(--carnet-action-container);
  color: var(--carnet-on-action-container);
}
body[data-bs-theme] .share-dialog-side .nav-pills .nav-item .nav-link.active::before {
  background-color: var(--carnet-focus);
}

/* 10. Toasts. */
body[data-bs-theme] .seahub-toast-alert-container {
  background: var(--carnet-paper);
  box-shadow: var(--carnet-lift-raised);
}
body[data-bs-theme] .seahub-toast-alert-container.success {
  border-left-color: var(--carnet-ok);
  color: var(--carnet-ok);
}
body[data-bs-theme] .seahub-toast-alert-container.warning {
  border-left-color: var(--carnet-waiting);
  color: var(--carnet-waiting);
}
body[data-bs-theme] .seahub-toast-alert-container.danger {
  border-left-color: var(--carnet-danger);
  color: var(--carnet-danger);
}
body[data-bs-theme] .seahub-toast-alert-container.none,
body[data-bs-theme] .seahub-toast-alert-container.notify-in-progress {
  border-left-color: var(--carnet-focus);
  color: var(--carnet-focus);
}
body[data-bs-theme] .seahub-toast-alert-container .toast-text-title {
  color: var(--carnet-ink);
}
body[data-bs-theme] .seahub-toast-alert-container .toast-close {
  color: var(--carnet-ink-muted);
}

/* 11. Progress. */
body[data-bs-theme] .progress {
  --bs-progress-bg: var(--carnet-track);
  --bs-progress-bar-bg: var(--carnet-focus);
  /* the copy/move dialog writes the percentage inside the bar: paper on the PRIMARY deep fill */
  --bs-progress-bar-color: var(--carnet-paper);
}

/* 12. Login page (base.html + seahub.css): the panel is a sheet over the login picture. */
body[data-bs-theme] .login-panel {
  background: var(--carnet-paper);
  color: var(--carnet-ink);
  box-shadow: var(--carnet-lift-float);
}
body[data-bs-theme] .login-panel .input {
  background-color: var(--carnet-field);
  border-color: var(--carnet-edge);
  color: var(--carnet-ink);
}
/* seahub.css rounds them with an id selector: #log-in-panel .input */
body[data-bs-theme] .login-panel .input,
body[data-bs-theme] #log-in-panel .input {
  border-radius: var(--carnet-radius-control);
}
body[data-bs-theme] .login-panel .input:focus {
  border-color: var(--carnet-focus);
  box-shadow: 0 0 0 1px var(--carnet-focus);
}
body[data-bs-theme] .login-panel .submit:focus {
  border-color: var(--carnet-action);
}
body[data-bs-theme] .login-panel .login-panel-bottom-container a,
body[data-bs-theme] .login-panel-bottom-privacy-policy a {
  color: var(--carnet-link);
}
body[data-bs-theme] #login-bottom .bottom-item,
body[data-bs-theme] .login-panel-bottom-privacy-policy .login-panel-bottom-seperator {
  border-right-color: var(--carnet-outline);
}
body[data-bs-theme] #toggle-show-password {
  color: var(--carnet-ink-muted);
}
/* the language list (seahub.css #lang-context-selector a is black) */
body[data-bs-theme] #lang-context-selector a {
  color: var(--carnet-ink);
}

/* 13. Check boxes and radios Seafile 14 draws itself (13 leaves them native, coloured by accent-color in 1,
   and a native one ignores these). A ticked box is a picture: the token draws its square in the focus colour
   and the paper behind shows through as the tick. */
body[data-bs-theme] .form-check-input {
  background-color: var(--carnet-field);
  border-color: var(--carnet-edge);
}
body[data-bs-theme] .form-check-input:checked {
  background-color: var(--carnet-focus);
  border-color: var(--carnet-focus);
}
body[data-bs-theme] .form-check-input:checked[type="checkbox"] {
  background-color: var(--carnet-paper);
  background-image: var(--carnet-checked-box);
}
body[data-bs-theme] .form-check-input:checked[type="radio"] {
  background-image: radial-gradient(circle closest-side, var(--carnet-paper) 0 48%, transparent 52%);
}
`;

/**
 * Seerr 3.5 (and the tokens of its pull request #3643, which keep the same classes). Always dark: its
 * tokens are the night's, on the root. With no setting yet it reaches the page through a proxy or an
 * extension, before or after Next.js's sheets: each rule is Seerr's own selector with one more `html`.
 * `!important` stands only where Seerr's class has it, and on the fades Seerr paints inline (style="").
 */
const SEERR = String.raw`
/* ---- Root: ground, scrollbars, selection, caret ---- */
html:root { scrollbar-color: var(--carnet-edge) transparent; }
html:root:hover { scrollbar-color: var(--carnet-ink-faint) transparent; }
html:root::-webkit-scrollbar-track { background: transparent; }
html:root::-webkit-scrollbar-thumb { background-color: var(--carnet-edge); }
html:root:hover::-webkit-scrollbar-thumb { background-color: var(--carnet-ink-faint); }
html body { background: var(--carnet-ground); }
/* page roots (Layout, Login, Setup, password reset) let the ground through */
html #__next > .bg-gray-900 { background-color: transparent; }
/* Layout's grey glow band at the top: the ground already brightens upward */
html #__next > .bg-gray-900 > .bg-gradient-to-bl,
html #__next > .bg-gray-900 > .bg-gradient-to-bl > .bg-gradient-to-t { background-image: none; }
html ::selection { background-color: var(--carnet-highlight); color: var(--carnet-ink); }
html input, html textarea { caret-color: var(--carnet-focus); }

/* ---- Neutral surfaces: gray-900 wall, 800 paper, 700 field, 600 paper-high ---- */
html .bg-gray-900 { background-color: var(--carnet-wall); }
html .bg-gray-900\/90 { background-color: rgb(var(--carnet-wall-rgb) / 0.9); }
html .bg-gray-900\/80, html .focus\:bg-gray-900:focus { background-color: var(--carnet-field); } /* the search field */
html .bg-gray-800, html .hover\:bg-gray-800:hover { background-color: var(--carnet-paper); }
html .\!bg-gray-800 { background-color: var(--carnet-paper) !important; }
html .bg-gray-800\/90 { background-color: rgb(var(--carnet-paper-rgb) / 0.9); }
html .bg-gray-800\/80 { background-color: rgb(var(--carnet-paper-rgb) / 0.8); }
html .bg-gray-800\/75 { background-color: rgb(var(--carnet-paper-rgb) / 0.75); }
html .bg-gray-800\/50 { background-color: rgb(var(--carnet-paper-rgb) / 0.5); }
html .bg-gray-800\/30 { background-color: rgb(var(--carnet-paper-rgb) / 0.3); }
html .bg-gray-800\/10 { background-color: rgb(var(--carnet-paper-rgb) / 0.1); }
html .bg-gray-800\/70 { background-color: var(--carnet-scrim); } /* Modal and SlideOver backdrops */
html .bg-gray-700, html .bg-gray-700\/100 { background-color: var(--carnet-field); }
html .bg-gray-700\/90 { background-color: rgb(var(--carnet-field-rgb) / 0.9); }
html .bg-gray-700\/80 { background-color: rgb(var(--carnet-field-rgb) / 0.8); }
html .bg-gray-700\/20 { background-color: rgb(var(--carnet-field-rgb) / 0.2); }
html .\!bg-gray-700\/80 { background-color: rgb(var(--carnet-field-rgb) / 0.8) !important; }
html .hover\:\!bg-gray-700:hover { background-color: var(--carnet-field) !important; }
html .searchbar.bg-gray-700\/80 { background-color: rgb(var(--carnet-paper-rgb) / 0.8); } /* top bar once scrolled */
html .bg-gray-600, html .bg-gray-500 { background-color: var(--carnet-paper-high); }
/* hover / focus / pressed: a step off paper */
html .hover\:bg-gray-700:hover,
html .focus\:bg-gray-700:focus,
html .active\:bg-gray-700:active,
html .group:hover .group-hover\:bg-gray-700,
html .hover\:bg-gray-600:hover,
html .focus\:bg-gray-600:focus { background-color: var(--carnet-paper-high); }
html .hover\:bg-gray-500:hover { background-color: color-mix(in srgb, var(--carnet-paper-high) 88%, var(--carnet-ink)); }
html .hover\:\!bg-gray-400:hover { background-color: var(--carnet-paper-high) !important; }
/* US certification chips: light (bg-gray-200) when the OS is light, dark:bg-gray-700 otherwise */
html .bg-gray-200.text-gray-700 { background-color: var(--carnet-field); color: var(--carnet-ink); }
html .bg-gray-200.hover\:bg-gray-300:hover { background-color: var(--carnet-paper-high); }
/* toggle knobs and radio dots stay light */
html .rounded-full.bg-white { background-color: var(--carnet-ink); }

/* card fades (PersonCard, CompanyCard) */
html .from-gray-900 { --tw-gradient-from: var(--carnet-wall) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
html .from-gray-800 { --tw-gradient-from: var(--carnet-paper) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }

/* ---- Neutral lines ---- */
html .border-gray-800, html .sm\:border-gray-800 { border-color: var(--carnet-hairline); }
html .border-gray-800.bg-gray-800 { border-color: var(--carnet-paper); } /* PullToRefresh: its thick border is its own paper */
html .divide-gray-800 > :not([hidden]) ~ :not([hidden]),
html .divide-gray-700 > :not([hidden]) ~ :not([hidden]),
html .divide-gray-600 > :not([hidden]) ~ :not([hidden]) { border-color: var(--carnet-hairline); }
html .border-gray-700, html .border-gray-600,
html .hover\:border-gray-600:hover, html .active\:border-gray-600:active,
html .group:hover .group-hover\:border-gray-600 { border-color: var(--carnet-outline); }
html .ring-gray-700, html .ring-gray-600 { --tw-ring-color: var(--carnet-outline); }
html .border-gray-500, html .hover\:border-gray-500:hover, html .focus\:border-gray-500:focus { border-color: var(--carnet-edge); }
html .\!border-gray-500 { border-color: var(--carnet-edge) !important; }
html .ring-gray-500, html .hover\:ring-gray-500:hover, html .focus\:ring-gray-500:focus { --tw-ring-color: var(--carnet-edge); }
html .border-gray-400, html .hover\:border-gray-400:hover, html .focus\:border-gray-400:focus { border-color: var(--carnet-ink-faint); }
html .border-gray-200 { border-color: var(--carnet-edge); } /* toggle knobs */
/* ghost buttons: light border on hover, focus edge on focus */
html .hover\:border-gray-200:hover, html .active\:border-gray-100:active { border-color: var(--carnet-ink-muted); }
html .focus\:border-gray-100:focus, html .focus\:border-blue-300:focus,
html .group:focus .group-focus\:border-blue-300 { border-color: var(--carnet-focus); }
/* default ring colour (focus:ring with no colour) and ring offsets */
html *, html ::before, html ::after { --tw-ring-color: var(--carnet-focus); --tw-ring-offset-color: var(--carnet-paper); }
html .focus\:ring-offset-gray-100:focus { --tw-ring-offset-color: var(--carnet-paper); }

/* ---- Inks (light text only; Seerr's dark text classes are left alone).
   The Discover date picker follows the OS colour scheme, so its texts are left as Seerr draws them. ---- */
html .text-white:where(:not(.datepicker-wrapper *)),
html .text-gray-50, html .text-gray-100, html .text-gray-200, html .text-neutral-200,
html .hover\:text-white:hover, html .hover\:text-gray-100:hover, html .hover\:text-gray-200:hover,
html .focus\:text-white:focus, html .active\:text-gray-200:active,
html .focus-within\:text-gray-200:focus-within,
html .group:hover .group-hover\:text-white { color: var(--carnet-ink); }
html .hover\:\!text-white:hover { color: var(--carnet-ink) !important; }
html .text-gray-300:where(:not(.datepicker-wrapper *)),
html .text-gray-400:where(:not(.datepicker-wrapper *)),
html .hover\:text-gray-300:hover, html .focus\:text-gray-300:focus { color: var(--carnet-ink-muted); }
html .\!text-gray-300, html .\!text-gray-400 { color: var(--carnet-ink-muted) !important; }
html .text-gray-500:where(:not(.datepicker-wrapper *)), html .focus\:text-gray-500:focus { color: var(--carnet-ink-faint); }
html .\!text-gray-500 { color: var(--carnet-ink-faint) !important; }
html input::placeholder, html textarea::placeholder,
html .placeholder-gray-300::placeholder,
html .focus\:placeholder-gray-400:focus::placeholder,
html .placeholder\:text-gray-400::placeholder { color: var(--carnet-ink-faint); }

/* ---- Seerr components (globals.css) ---- */
html .sidebar { background: var(--carnet-paper); border-color: var(--carnet-outline); }
html code { background-color: var(--carnet-paper); }
html .slider-title, html .media-attributes, html .media-overview h2, html .media-overview p,
html ul.media-crew > li, html a.crew-name, html .media-fact-value a, html .media-fact-value button,
html .media-fact-value, html .error-message, html .description, html .tagline,
html label, html .group-label { color: var(--carnet-ink-muted); }
html a.slider-title:hover, html .media-attributes a:hover,
html a.crew-name:hover, html .media-fact-value a:hover, html .media-fact-value button:hover,
html .media-title, html .media-overview, html .heading, html .card-field a:hover,
html .section, html .form-input-area, html .form-group, html .actions,
html label a, html label a:hover { color: var(--carnet-ink); }
html .label-tip { color: var(--carnet-ink-faint); }
html .label-required, html .error { color: var(--carnet-danger); }
html .media-facts { background-color: var(--carnet-wall); border-color: var(--carnet-outline); color: var(--carnet-ink-muted); }
html .media-fact, html .media-ratings, html .actions { border-color: var(--carnet-hairline); }

/* text fields and selects */
html input[type='text'], html input[type='password'], html select, html textarea {
  background-color: var(--carnet-field); border-color: var(--carnet-edge); color: var(--carnet-ink);
}
html input:where([type='text']):focus, html input:where(:not([type])):focus, html input:where([type='email']):focus,
html input:where([type='url']):focus, html input:where([type='password']):focus, html input:where([type='number']):focus,
html input:where([type='date']):focus, html input:where([type='datetime-local']):focus, html input:where([type='month']):focus,
html input:where([type='search']):focus, html input:where([type='tel']):focus, html input:where([type='time']):focus,
html input:where([type='week']):focus, html select:where([multiple]):focus, html textarea:focus, html select:focus {
  --tw-ring-color: var(--carnet-focus); border-color: var(--carnet-focus);
}
html .protocol { background-color: var(--carnet-paper-high); border-color: var(--carnet-edge); color: var(--carnet-ink); }

/* checkboxes: field box drawn by its edge; checked = primary wash under the white tick, focus edge */
html input:where([type='checkbox']) { background-color: var(--carnet-field); border-color: var(--carnet-edge); }
html input[type='checkbox'] { color: var(--carnet-action-container); }
html input:where([type='checkbox']):checked,
html input:where([type='checkbox']):checked:hover,
html input:where([type='checkbox']):checked:focus { border-color: var(--carnet-focus); }
html input:where([type='checkbox']):focus { --tw-ring-color: var(--carnet-focus); --tw-ring-offset-color: var(--carnet-paper); }

/* range thumbs (MultiRangeSlider) */
html input[type='range']::-webkit-slider-thumb { background-color: var(--carnet-focus); }
html input[type='range']::-moz-range-thumb { background-color: var(--carnet-focus); }

/* react-select */
html .react-select-container .react-select__control,
html .react-select-container .react-select__control--is-focused,
html .react-select-container:has(+ .input-action) .react-select__control {
  background-color: var(--carnet-field); border-color: var(--carnet-edge); color: var(--carnet-ink);
}
html .react-select-container .react-select__control:hover,
html .react-select-container:has(+ .input-action) .react-select__control:hover { border-color: var(--carnet-edge); }
html .react-select-container-dark .react-select__control,
html .react-select-container-dark .react-select__control--is-focused { background-color: var(--carnet-paper); border-color: var(--carnet-outline); }
html .react-select-container .react-select__menu { background-color: var(--carnet-paper); color: var(--carnet-ink-muted); }
html .react-select-container-dark .react-select__menu { background-color: var(--carnet-paper); }
html .react-select-container .react-select__option--is-focused,
html .react-select-container-dark .react-select__option--is-focused { background-color: var(--carnet-paper-high); color: var(--carnet-ink); }
html .react-select-container .react-select__indicator-separator { background-color: var(--carnet-edge); }
html .react-select-container .react-select__indicator,
html .react-select-container .react-select__placeholder { color: var(--carnet-ink-faint); }
html .react-select-container .react-select__multi-value { background-color: var(--carnet-paper); border-color: var(--carnet-edge); }
html .react-select-container .react-select__multi-value__label,
html .react-select-container .react-select__input-container,
html .react-select-container .react-select__single-value { color: var(--carnet-ink); }

/* release notes and issue comments (typography plugin) */
html .prose { color: var(--carnet-ink-muted);
  --tw-prose-headings: var(--carnet-ink); --tw-prose-lead: var(--carnet-ink-muted); --tw-prose-counters: var(--carnet-ink-faint);
  --tw-prose-bullets: var(--carnet-edge); --tw-prose-hr: var(--carnet-hairline); --tw-prose-quotes: var(--carnet-ink-muted);
  --tw-prose-quote-borders: var(--carnet-outline); --tw-prose-kbd: var(--carnet-ink); --tw-prose-kbd-shadows: var(--carnet-hairline);
  --tw-prose-pre-code: var(--carnet-ink); --tw-prose-pre-bg: var(--carnet-paper);
  --tw-prose-th-borders: var(--carnet-outline); --tw-prose-td-borders: var(--carnet-hairline); }
html .prose :where(a):not(:where([class~="not-prose"],[class~="not-prose"] *)),
html .prose :where(a):not(:where([class~="not-prose"],[class~="not-prose"] *)):hover { color: var(--carnet-link); }
html .prose :where(figcaption):not(:where([class~="not-prose"],[class~="not-prose"] *)) { color: var(--carnet-ink-faint); }

/* ---- ACCENT: what acts ---- */
/* filled buttons: Button primary, ButtonWithDropdown, Dropdown toggle (all three carry text-white and border-indigo-500) */
html .bg-indigo-600\/80 { background-color: var(--carnet-action); }
html .bg-indigo-600\/80.border-indigo-500 { border-color: var(--carnet-action); }
html .bg-indigo-600\/80.text-white { color: var(--carnet-on-action); }
/* ButtonWithDropdown: keep a seam between the action and its chevron */
html .rounded-l-md.bg-indigo-600\/80.border-indigo-500 { border-right-color: color-mix(in srgb, var(--carnet-action) 70%, var(--carnet-on-action)); }
html .rounded-r-md.bg-indigo-600\/80.border-indigo-500 { border-left-color: color-mix(in srgb, var(--carnet-action) 70%, var(--carnet-on-action)); }
/* hover deepens the fill toward the ink, as the app's filled button */
html .hover\:bg-indigo-600:hover,
html .active\:bg-indigo-600:active,
html .active\:bg-indigo-700:active { background-color: color-mix(in srgb, var(--carnet-action) 90%, var(--carnet-ink)); }
html .hover\:border-indigo-500:hover,
html .active\:border-indigo-700:active { border-color: color-mix(in srgb, var(--carnet-action) 90%, var(--carnet-ink)); }
html .focus\:border-indigo-700:focus { border-color: var(--carnet-focus); }
/* the button glued to a text field (copy, regenerate...) */
html button.input-action { background-color: var(--carnet-action); border-color: var(--carnet-edge); color: var(--carnet-on-action); }
html button.input-action:not([disabled]):hover,
html button.input-action:not([disabled]):active { background-color: color-mix(in srgb, var(--carnet-action) 90%, var(--carnet-ink)); color: var(--carnet-on-action); }
/* links */
html .text-indigo-500.hover\:underline,
html .text-indigo-500.hover\:text-indigo-400,
html .hover\:text-indigo-400:hover { color: var(--carnet-link); }
/* modal, slide-over and profile titles: Seerr's gradient text, in the app's two colours */
html .text-overseerr {
  --tw-gradient-from: var(--carnet-link) var(--tw-gradient-from-position);
  --tw-gradient-to: var(--carnet-focus) var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
}
html .hover\:to-purple-200:hover { --tw-gradient-to: var(--carnet-ink) var(--tw-gradient-to-position); }

/* ---- PRIMARY: what is chosen or focused ---- */
/* selected washes carrying light text: dropdown menu and items, highlighted list option, selected chip,
   progress fills with their figure on top, completed setup step, brand badges, info alert */
html .bg-indigo-600, html .bg-indigo-700,
html .bg-indigo-500\/80, html .bg-indigo-400\/20 { background-color: var(--carnet-action-container); }
html .hover\:bg-indigo-500:hover,
html .hover\:bg-indigo-700:hover { background-color: color-mix(in srgb, var(--carnet-action-container) 88%, var(--carnet-on-action-container)); }
/* active nav item (sidebar, user menu), ghost dropdown item on hover, count badges */
html .from-indigo-600 { --tw-gradient-from: var(--carnet-action-container) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
html .hover\:from-indigo-500:hover { --tw-gradient-from: color-mix(in srgb, var(--carnet-action-container) 88%, var(--carnet-on-action-container)) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
html .to-purple-600 { --tw-gradient-to: var(--carnet-action-container) var(--tw-gradient-to-position); }
html .hover\:to-purple-500:hover { --tw-gradient-to: color-mix(in srgb, var(--carnet-action-container) 88%, var(--carnet-on-action-container)) var(--tw-gradient-to-position); }
/* the count badge sitting on the active nav item takes the accent, so it stands off the wash */
html .from-indigo-700 { --tw-gradient-from: var(--carnet-action) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
html .to-purple-700 { --tw-gradient-to: var(--carnet-action) var(--tw-gradient-to-position); }
html .from-indigo-700.\!text-indigo-100 { color: var(--carnet-on-action) !important; }
html .from-indigo-700.border-indigo-600 { border-color: var(--carnet-action); }
/* brand badges (Badge default, StatusBadgeMini processing): edge = fill */
html .bg-indigo-500\/80.border-indigo-500, html .border-indigo-400 { border-color: var(--carnet-action-container); }
html .ring-indigo-400 { --tw-ring-color: var(--carnet-action-container); }
html .\!text-indigo-100 { color: var(--carnet-on-action-container) !important; }
html .text-indigo-100 { color: var(--carnet-on-action-container); }
html .text-indigo-200 { color: var(--carnet-ink-muted); }
/* marks: switches on, range highlight, loading bar */
html .bg-indigo-500:where(:not(.datepicker-wrapper *)), html .bg-indigo-400 { background-color: var(--carnet-focus); }
/* LibraryItem switch (knob inside the track), as the app's switch: on = focus track, dark knob; off = faint knob */
html [role='checkbox'].bg-indigo-600 { background-color: var(--carnet-focus); }
html [role='checkbox'].bg-indigo-600 > .bg-white { background-color: var(--carnet-wall); }
html [role='checkbox'].bg-gray-700 > .bg-white { background-color: var(--carnet-ink-faint); }
html [role='checkbox'].bg-gray-700 > .bg-white .text-gray-400 { color: var(--carnet-paper); }
/* CreateIssueModal radios: off = field drawn by its edge (its dot melts in, as Seerr's white on white); on = focus, dark dot */
html .h-4.w-4.rounded-full.bg-white { background-color: var(--carnet-field); border-color: var(--carnet-edge); }
html .h-4.w-4.rounded-full.bg-white > .rounded-full.bg-white { background-color: var(--carnet-field); }
html .h-4.w-4.rounded-full.bg-indigo-600 { background-color: var(--carnet-focus); }
html .h-4.w-4.rounded-full.bg-indigo-600 > .rounded-full.bg-white { background-color: var(--carnet-wall); }
/* chosen text and the selected edge: active tab, mobile menu, check icons, drop indicator, info alert edge */
html .text-indigo-500:where(:not(.datepicker-wrapper *)), html .text-indigo-600:where(:not(.datepicker-wrapper *)) { color: var(--carnet-focus); }
html .border-indigo-500, html .border-indigo-600 { border-color: var(--carnet-focus); }
html .ring-indigo-500, html .ring-indigo-300, html .focus\:ring-indigo-500:focus { --tw-ring-color: var(--carnet-focus); }

/* ---- Backdrop fades. Seerr paints these tints in a style="" attribute, which only !important can
   override: they are recoloured (same angles, stops and alphas), the images under them are untouched.
   Without this, each fade ends in Seerr's blue-grey and leaves a hard seam on the app's paper. ---- */
/* movie, series, collection and issue pages; Login, Setup, password reset, person and profile banners */
html .media-page-bg-image > div.absolute.inset-0,
html .absolute-top-shift > div.absolute.inset-0 { background-image: linear-gradient(180deg, rgb(var(--carnet-wall-rgb) / 0.47) 0%, var(--carnet-wall) 100%) !important; }
/* modal header (request modal) */
html .h-64.max-h-full > div.absolute.inset-0 { background-image: linear-gradient(180deg, rgb(var(--carnet-paper-rgb) / 0.75) 0%, var(--carnet-paper) 100%) !important; }
/* request, issue and blocklist rows */
html .inset-0.xl\:w-2\/3 > div.absolute.inset-0 { background-image: linear-gradient(90deg, rgb(var(--carnet-paper-rgb) / 0.47) 0%, var(--carnet-paper) 100%) !important; }
/* request cards (sliders) */
html [data-testid='request-card'] > .inset-0.z-0 > div.absolute.inset-0 { background-image: linear-gradient(135deg, rgb(var(--carnet-wall-rgb) / 0.47) 0%, var(--carnet-wall) 75%) !important; }
/* collection card on a movie page */
html .group.z-0.rounded-lg > .inset-0.z-0 > div.absolute.inset-0 { background-image: linear-gradient(180deg, rgb(var(--carnet-paper-rgb) / 0.47) 0%, rgb(var(--carnet-paper-rgb) / 0.8) 100%) !important; }
/* title card details on hover */
html .rounded-xl > a.absolute.inset-0.cursor-pointer { background-image: linear-gradient(180deg, rgb(var(--carnet-paper-rgb) / 0.4) 0%, rgb(var(--carnet-paper-rgb) / 0.9) 100%) !important; }
`;

/**
 * Immich 3.3 (@immich/ui 0.90). Night is `class="dark"` on <html>. Its styles live in Tailwind's
 * cascade layers, so these unlayered rules win without `!important`, mostly by pointing Immich's own
 * variables at the tokens. The photo viewer keeps Immich's colours.
 */
const IMMICH = String.raw`
/* 1. Immich's theme variables, re-pointed. @immich/ui takes full colours; Immich's own --immich-*
   take "R G B" channels. "Primary" becomes the ACCENT deep (links, text buttons, edges); its tints
   become the PRIMARY wash. Inside forced-dark bars @immich/ui re-declares its own values. */
:root {
  --immich-ui-primary-50: var(--carnet-action-container);
  --immich-ui-primary-100: var(--carnet-action-container);
  --immich-ui-primary-200: var(--carnet-action-container);
  --immich-ui-primary-300: var(--carnet-action-container);
  --immich-ui-primary-400: var(--carnet-focus);
  --immich-ui-primary-500: var(--carnet-link);
  --immich-ui-primary-800: var(--carnet-on-action-container);
  --immich-ui-danger-500: var(--carnet-danger);
  --immich-ui-dark: var(--carnet-ink);
  --immich-ui-gray: var(--carnet-paper);
  --immich-ui-muted: var(--carnet-ink-muted);
  --immich-ui-default-border: var(--carnet-hairline);
  --immich-ui-light-50: var(--carnet-paper);
  --immich-ui-light-100: var(--carnet-paper);
  --immich-ui-light-200: var(--carnet-paper-high);
  --immich-ui-light-300: var(--carnet-paper-high);
  --immich-ui-light-400: var(--carnet-edge);
  --immich-ui-light-500: var(--carnet-ink-faint);
  --immich-ui-light-600: var(--carnet-ink-faint);
  --immich-ui-light-700: var(--carnet-ink-muted);
  --immich-ui-light-800: var(--carnet-ink);
  --immich-ui-light-900: var(--carnet-ink);
  --immich-ui-dark-600: var(--carnet-hairline);
  --immich-ui-dark-900: var(--carnet-paper);
  --immich-ui-dark-950: var(--carnet-wall);
}

/* Immich's own day colours (classes without dark: variant also show by night, so day only). */
:root:not(.dark) {
  --immich-primary: var(--carnet-link-rgb);
  --immich-bg: var(--carnet-paper-rgb);
  --immich-fg: var(--carnet-ink-rgb);
}

/* Immich's own night colours (used through dark: variants). */
:root.dark {
  --immich-dark-primary: var(--carnet-link-rgb);
  --immich-dark-bg: var(--carnet-paper-rgb);
  --immich-dark-fg: var(--carnet-ink-rgb);
  --immich-dark-gray: var(--carnet-paper-rgb);
}

/* Faint primary tints with ink on them (key caps, recent searches) also by night. */
:root.dark :is(.bg-immich-primary\/25, .hover\:bg-immich-primary\/25, .aria-selected\:bg-immich-primary\/25) {
  --immich-primary: var(--carnet-link-rgb);
}

/* 2. Ground: the page and the side bars sit on it (fixed, so the bars join the page seamlessly). */
:root:is(.dark, .light) {
  background: var(--carnet-ground);
}

body:not(.asset-viewer-open) {
  background: transparent;
}

#sidebar,
.immich-scrollbar.bg-light.shrink-0 {
  background: var(--carnet-ground);
}

/* Immich's "light" surfaces (dialogs, toasts, side panels) are sheets of paper. Painted by class, so
   --immich-ui-light itself (white text on fills, avatar initials) stays Immich's. */
.bg-light:where(:not(img, body, body .dark, body .dark *)) {
  background-color: var(--carnet-paper);
}

/* 3. ACCENT: filled primary buttons (and links styled as them). */
:is(button, a).bg-primary.text-light {
  --immich-ui-primary-500: var(--carnet-action);
  --immich-ui-light: var(--carnet-on-action);
}

:is(button, a).bg-danger.text-light {
  --immich-ui-light: var(--carnet-on-danger);
}

/* 4. PRIMARY: what is chosen or focused. */
/* Active item of the side bars (and the Administration button while in admin). */
a[aria-current="page"] {
  background-color: var(--carnet-action-container);
  color: var(--carnet-on-action-container);
}

/* Inside PRIMARY washes (alerts, toasts, badges): primary text takes the wash's ink. */
:is(.bg-primary-50, .bg-primary-100) {
  --immich-ui-primary-500: var(--carnet-on-action-container);
}

/* Switches (bits-ui): on = focus track and an on-action thumb; off = paper-high track with an edge. */
[data-switch-root][data-state="checked"] {
  --immich-ui-primary-100: var(--carnet-focus);
  --immich-ui-primary-200: var(--carnet-focus);
  --immich-ui-primary-500: var(--carnet-on-action);
}

[data-switch-root][data-state="unchecked"] {
  border-color: var(--carnet-edge);
}

[data-switch-thumb][data-state="unchecked"] {
  background-color: var(--carnet-ink-faint);
}

/* Checkboxes (bits-ui): an edge when off; focus fill with an on-action tick when on. */
[data-checkbox-root] {
  --immich-ui-primary-500: var(--carnet-edge);
  --immich-ui-light: var(--carnet-on-action);
}

[data-checkbox-root]:is([data-state="checked"], [data-state="indeterminate"]) {
  --immich-ui-primary-500: var(--carnet-focus);
}

/* Progress and meters (storage space, uploads, jobs). */
:is([data-progress-root], [data-meter-root]) {
  --immich-ui-primary-500: var(--carnet-focus);
  background-color: var(--carnet-track);
}

/* Selected photos: a PRIMARY wash frame and a focus check; range candidates and focus outline too. */
[data-thumbnail-focus-container] {
  --immich-ui-primary-500: var(--carnet-focus);
  --immich-primary: var(--carnet-focus-rgb);
}

:root.dark [data-thumbnail-focus-container] {
  --immich-dark-primary: var(--carnet-focus-rgb);
}

[data-thumbnail-focus-container][data-selected] {
  background-color: var(--carnet-action-container);
}

[data-thumbnail-focus-container] [role="checkbox"][aria-checked="true"] > div {
  background-color: var(--carnet-on-action);
}

/* A whole day selected: the check beside its date. */
section[data-group] > :first-child {
  --immich-ui-primary-500: var(--carnet-focus);
}

/* Focus rings. */
:focus-visible:where(:not(#immich-asset-viewer *, body .dark, body .dark *)) {
  outline-color: var(--carnet-focus);
}

/* 5. Text fields: @immich/ui inputs, selects and text areas, and Immich's immich-form-input.
   Re-pointed inside the field, so Immich's own disabled and invalid states still apply. */
:is(.ring-gray-200, .immich-form-input) {
  --color-gray-100: var(--carnet-field);
  --color-gray-800: var(--carnet-field);
  --color-gray-200: var(--carnet-edge);
  --color-neutral-700: var(--carnet-edge);
  --color-neutral-900: var(--carnet-edge);
  --immich-ui-primary-500: var(--carnet-focus);
}

/* The search bar and its drop-down. */
#main-search-bar {
  background-color: var(--carnet-field);
  color: var(--carnet-ink);
}

#main-search-bar::placeholder {
  color: var(--carnet-ink-faint);
}

[role="search"] [role="listbox"] > div {
  background-color: var(--carnet-paper);
  color: var(--carnet-ink);
}

/* The smaller search fields (albums, people, places, admin settings). */
:has(> input.bg-gray-200.dark\:bg-gray-800) {
  --color-gray-200: var(--carnet-field);
  --color-gray-800: var(--carnet-field);
}

/* Name fields under the faces (People). */
input.placeholder-gray-400 {
  background-color: var(--carnet-field);
}

input.placeholder-gray-400::placeholder {
  color: var(--carnet-ink-faint);
}

/* Segmented filters (Albums: All / Owned / Shared; shared links): field, chosen in the PRIMARY wash. */
fieldset.ring-gray-400 {
  --color-gray-200: var(--carnet-field);
  --color-gray-300: var(--carnet-action-container);
  --color-gray-700: var(--carnet-action-container);
  --color-gray-800: var(--carnet-paper-high);
  --color-gray-400: var(--carnet-focus);
  --color-gray-600: var(--carnet-focus);
}

/* 6. Sheets. */
/* Immich's own "..." menus (slate in both modes in Immich). */
:has(> ul[role="menu"]) {
  background-color: var(--carnet-paper);
  box-shadow: var(--carnet-lift-float);
}

li[role="menuitem"] {
  color: var(--carnet-ink);
}

li[role="menuitem"].bg-slate-100 {
  background-color: var(--carnet-paper);
}

li[role="menuitem"].bg-slate-300 {
  background-color: var(--carnet-paper-high);
}

li[role="menuitem"] .text-gray-500 {
  color: var(--carnet-ink-muted);
}

/* Dialog backdrop. */
[data-dialog-overlay] {
  background-color: var(--carnet-scrim);
}

/* 7. Inks: Immich's mid-grey secondary text, too pale on the ground, takes ink-muted. */
:is(.text-gray-400, .text-gray-500, .text-gray-600, .text-neutral-500, .immich-form-label):where(:not(svg, #immich-asset-viewer *, body .dark, body .dark *)) {
  color: var(--carnet-ink-muted);
}

/* Text selection. */
::selection {
  background-color: var(--carnet-highlight);
  color: var(--carnet-ink);
}
`;

export const CSS_RULES: Readonly<Record<CssService, CssRules>> = {
  seafile: { name: 'Seafile', modes: [['light', ':root'], ['dark', '[data-bs-theme="dark"]']], rules: SEAFILE, paste: 'Paste it in Seafile: System Admin > Settings > Branding > "Custom CSS", save it with the tick button beside the box, then tick "Use custom CSS".' },
  seerr: { name: 'Seerr', modes: [['dark', ':root']], rules: SEERR, paste: 'Seerr has no setting for it yet: add it with a browser extension such as Stylus, or have your reverse proxy link it from each page.' },
  immich: { name: 'Immich', modes: [['light', ':root'], ['dark', ':root.dark']], rules: IMMICH, paste: 'Paste it in Immich: Administration > Settings > Theme Settings > "Custom CSS", then Save.' },
};
