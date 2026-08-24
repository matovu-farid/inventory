# Logged-out `/home` Landing Page Design

## Goal

Give logged-out visitors a clear, warm introduction to Inventory while making returning users reach `/login` quickly. The page should feel like the product: practical, calm, and built for people managing a real shop floor.

## Approved direction

Use the “Practical & human” visual direction:

- Warm off-white background with charcoal text.
- Restrained terracotta accents and small emerald status highlights.
- Rounded cards and subtle borders rather than heavy shadows.
- Editorial but operational copy, avoiding generic startup language.
- Responsive layout: split hero on desktop, stacked hero on mobile.

## Page structure

### Header

- Inventory logo and name.
- “How it works” anchor link.
- “Sign in” link to `/login`.
- Dark “Request access” button.

### Hero

- Eyebrow describing the product category.
- Headline: “Run the floor with clarity.”
- Supporting copy about stock, sales, and supply routes.
- Primary “Start managing” / “Sign in” action to `/login`.
- Secondary “Request access” action opening the access modal.
- Warm dashboard preview showing stock movement and daily operations.

### Benefits

Three concise benefits:

1. Know what’s in stock.
2. Move goods with confidence.
3. See the numbers clearly.

The section is the target of the “How it works” anchor link.

### Footer

Compact product statement and a secondary sign-in link.

## Request-access behavior

The request-access button opens a modal containing name, email, and a short message fields. Submission is intentionally disabled for now and the modal explains that an administrator must provide an invite. The form must not send or persist user data.

The modal must be keyboard accessible, closeable with an explicit close button and Escape, and return focus to the triggering button when closed.

## Routing and remembered access

- Add a public `/home` route.
- If an authenticated user opens `/home`, redirect them to `/`.
- On successful sign-in, set a long-lived first-party cookie named `inventory_has_logged_in` with `Max-Age`, `Path=/`, and `SameSite=Lax`.
- If a logged-out visitor opens `/home` and the cookie exists, redirect them to `/login`.
- A first-time logged-out visitor without the cookie sees the landing page.
- Existing `/` protected-route behavior remains unchanged.
- Logout leaves the remembered-access cookie intact, so returning logged-out users continue to land on `/login`.

## Components and boundaries

- `src/routes/home.tsx`: public route, page composition, client-side cookie checks, authenticated redirect.
- `src/components/request-access-dialog.tsx`: presentational modal and disabled submission state.
- `src/routes/login.tsx`: set the remembered-access cookie only after a successful sign-in or first-account creation flow.
- `src/routes/__root__.tsx`: register `/home` as a public path so the existing auth gate does not hide it.

Use existing `Logo`, `Button`, `Input`, `Label`, dialog primitives, icons, colors, and typography conventions where possible.

## Accessibility and responsive behavior

- Use semantic `header`, `main`, `section`, and `footer` landmarks.
- Keep visible focus states on all links and buttons.
- Use one `h1` and meaningful section heading hierarchy.
- Provide accessible names for icon-only controls and the modal close action.
- Maintain readable contrast for the warm palette.
- Collapse hero columns and benefit cards cleanly below the medium breakpoint.
- Ensure the page does not rely on hover to communicate essential information.

## Verification

- Run the project’s typecheck/build command.
- Exercise `/home` as a first-time logged-out visitor.
- Exercise `/home` with `inventory_has_logged_in` present while logged out and confirm redirect to `/login`.
- Exercise `/home` while authenticated and confirm redirect to `/`.
- Confirm login sets the cookie after successful authentication.
- Confirm request-access modal opens, closes, does not submit, and remains usable on mobile-sized viewports.

## Out of scope

- Persisting or sending access requests.
- Changing the authenticated dashboard at `/`.
- Adding marketing analytics or third-party tracking.
- Changing authentication server behavior.
