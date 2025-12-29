/**
 * Centralized Zod configuration
 *
 * Configures Zod with jitless mode to avoid CSP violations.
 * Zod's JIT optimization uses `new Function()` which triggers CSP errors
 * when 'unsafe-eval' is not allowed. Setting jitless: true disables this.
 *
 * @see https://github.com/colinhacks/zod/issues/4461
 */
import { z } from "zod";

z.config({ jitless: true });

export { z };
