# Publish dependency pruning results

**Measured:** 28 August 2026, local Linux x64, Node 24, pnpm 10.26.1

## Before and after

Both installs started without `node_modules` in detached copies of the same
workspace and used the same populated pnpm store (`--prefer-offline`). Timings
are informational because shared-runner load varied during the measurements.

| Measurement | Before | After | Result |
| --- | ---: | ---: | ---: |
| Clean install duration | 19,228 ms | 21,541 ms | 2,313 ms slower in this noisy run |
| Clean `node_modules` size | 929,278,376 bytes | 760,210,064 bytes | 169,068,312 bytes smaller (18.2%) |
| Installed package directories | 1,786 | 1,749 | 37 fewer (2.1%) |
| API production dependencies | 117,664,248 bytes | 117,450,791 bytes | 213,457 bytes smaller |
| Web production dependencies | 44,636,939 bytes | 965,135 bytes | 43,671,804 bytes smaller |
| Mobile production dependencies | 318,897,439 bytes | 318,895,864 bytes | 1,575 bytes smaller |
| Total production dependencies | 481,198,626 bytes | 437,311,790 bytes | 43,886,836 bytes smaller (9.1%) |

Production dependency size is the sum of each artifact's `node_modules` after
`pnpm --filter <artifact> deploy --prod --legacy`. Workspace libraries are
linked separately and are not counted as third-party runtime dependencies.

## Removed packages

Repository-wide searches covered source, tests, configuration, scripts, Expo
configuration and release files before removal.

- Removed `date-fns` from the web and mockup manifests. Neither artifact
  imported it. `react-day-picker` still correctly retains its own `date-fns` 4
  dependency.
- Removed `react-icons` from the web manifest. Web icon imports use
  `lucide-react`.
- Removed the direct `@expo/ngrok` development dependency. No workflow, script,
  Expo configuration or release path uses tunnel mode.

The lockfile no longer contains `date-fns` 3, `react-icons`, `@expo/ngrok`, or
its platform binary.

## Version alignment

- Pinned direct TanStack Query packages to 5.101.1 through the workspace
  catalog. This gives the web, mobile and generated API client one direct
  release line. Clerk's independent `query-core` 5.100.9 remains because it is
  a transitive consumer.
- Aligned the direct Expo CLI with the 54.0.24 version required by
  `expo@54.0.34`, removing the duplicate 54.0.23 installation.
- Added the workspace Zod 3 catalog dependency to the OpenAI wrapper so both
  direct OpenAI consumers use the same supported Zod peer context.

The remaining `date-fns` 4, Zod 4, and older WebSocket majors are required by
independent transitive consumers (React Day Picker, EAS/Orval, and development
tools respectively). They were not overridden across incompatible peer ranges.

## Builder and runtime separation

- Moved API type declarations for Multer and Nodemailer to `devDependencies`.
- Moved bundled web libraries, Vite plugins, tests, Playwright and other build
  inputs to `devDependencies`.
- Kept only `pg` and the three workspace libraries imported by the Node web
  server (`blog-content`, `delivery`, and `display-currency`) in web production
  dependencies.
- Left Expo native modules and config plugins in mobile production dependencies
  because EAS and app-store builds require them.

## Verification

- Frozen clean installation passed.
- API typecheck, build, provenance verification, and production-only startup
  passed.
- Web typecheck, build, integrity/provenance verification, compression checks,
  social-share checks, and production-only startup passed.
- Mockup typecheck and build passed with its required artifact `PORT` and
  `BASE_PATH`.
- Mobile typecheck and production bundle build passed for iOS and Android.
- Existing broad-suite failures remain: API 33 tests, web 53 tests, and mobile
  7 tests; mobile lint also reports pre-existing unused imports. None points to
  a removed package or dependency-resolution failure.
- Expo's compatibility check still reports existing native package-version
  recommendations. Those major/native changes were deliberately left outside
  this dependency-pruning task.