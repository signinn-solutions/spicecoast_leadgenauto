# Focused frontend interaction review

Scope: outreach review modal, lead detail drawer, and mobile sidebar. Existing layout and visual styles were preserved.

| Finding | Fix |
| --- | --- |
| Modal focus reset whenever the parent rerendered because its effect depended on an inline `onClose` callback. | Stable dialog focus routine now runs only when the dialog opens or closes. |
| Lead drawer did not contain keyboard focus, close on Escape, or return focus to its opener. | Shared dialog routine now handles Tab, Escape, opener focus, and page scroll. |
| Backdrop `div` click handlers produced two deterministic 21st accessibility errors. | Backdrops close only when the pointer starts on the backdrop itself; visible buttons and Escape provide keyboard close paths. |
| Mobile sidebar had no Escape handling or focus containment; collapsed links lacked explicit names. | Mobile sidebar uses dialog keyboard behavior, has a labeled close control, and nav buttons retain accessible names when collapsed. |

`21st.cmd review --json` reported one error each for the modal and drawer before the changes. It reports zero errors, warnings, or suggestions for all three reviewed components afterward. `npm.cmd run build` passes. This review does not include browser-based screen reader or visual QA.

Follow-up checks found that simulated discovery consumes the daily app quota and its records cannot be sent email. Discovery now calls these examples, uses native mode buttons, and disables search at zero remaining quota. Outreach actions now require both a live outreach record and its saved live lead; records with unknown or missing lead sources remain review only. The drawer keeps the editor open if saving fails. The build passes, and 21st reports no errors or warnings for these components; Outreach retains one preexisting hardcoded-color suggestion.

The final consistency pass requires `source === "live"` for dashboard and analytics live counts and for the CRM's verified contact filters. Unknown-source records are labeled separately from simulations. Dashboard cards and clickable CRM names respond to Enter and Space. Provider website links in CRM and lead details require an absolute HTTP or HTTPS URL. Build and URL assertions pass; 21st reports no errors or warnings in Dashboard, Analytics, or Leads. Analytics has hardcoded chart-color suggestions only.
