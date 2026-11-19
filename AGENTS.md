## Application architecture
- Keep all local-program data access, mock state and browser configuration storage in `src/lib/api.ts`; screens must not fetch or read storage directly so switching the mock flag requires no UI changes.
- Render local-API views behind `ClientOnly` and prime Query caches only in browser loaders; localhost addresses the end user's computer, never the SSR host.
- Use shared query options with a 1500ms polling interval and optimistic mutations with rollback; all live views must share the same cache keys.
- Use TanStack file routes and the root app shell for navigation, and dnd-kit with keyboard and touch support for template ordering; this preserves typed navigation and accessible sorting.
- Store visual roles and component styles in the global CSS design system and use existing shadcn controls; official game covers are served through project asset pointers.
