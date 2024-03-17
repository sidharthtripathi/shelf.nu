import { type Event, type EventHint } from "@sentry/remix";
import * as Sentry from "@sentry/remix";

import { SENTRY_DSN } from "~/utils/env";
import type { ShelfError } from ".";
import { isLikeShelfError } from ".";

export function initSentry() {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      // Performance Monitoring
      tracesSampleRate: 0.1,
      beforeBreadcrumb(breadcrumb) {
        // Remove some noisy breadcrumbs
        if (
          breadcrumb.message?.startsWith("🚀") ||
          breadcrumb.message?.startsWith("🌍")
        ) {
          return null;
        }

        if (breadcrumb.message) {
          // Remove chalk colors that pollute the logs
          breadcrumb.message = breadcrumb.message.replace(
            // eslint-disable-next-line no-control-regex -- let me do my thing
            /(\x1B\[32m|\x1B\[0m)/gm,
            ""
          );
        }

        return breadcrumb;
      },

      beforeSendTransaction(event, hint) {
        return handleBeforeSend(event, hint);
      },
      beforeSend(event, hint) {
        return handleBeforeSend(event, hint);
      },
    });
  }
}

/**
 * Filter out non 5xx errors to avoid spamming and log only the necessary.
 */
function handleBeforeSend<E extends Event>(event: E, hint: EventHint) {
  const exception = hint.originalException;

  if (
    !exception ||
    (isLikeShelfError(exception) && !exception.shouldBeCaptured)
  ) {
    return null;
  }

  return {
    ...event,
    ...makeSentryContext(exception),
  };
}

/**
 * Make the Sentry context from our ShelfError
 */
function makeSentryContext(event: unknown | null | undefined) {
  if (!event) {
    return;
  }

  const maybeShelfError = event as Partial<ShelfError>;

  return {
    user: {
      id: (maybeShelfError.additionalData?.userId as string) || "?",
    },
    tags: {
      label: maybeShelfError.label || "Unknown",
    },
    extra: {
      ...(maybeShelfError.additionalData || {}),
      traceId: maybeShelfError.traceId,
      message: maybeShelfError.message,
      cause: {
        message: (maybeShelfError.cause as Error | null)?.message,
        raw: JSON.stringify(maybeShelfError.cause),
      },
    },
  };
}
