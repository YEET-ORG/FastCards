import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Legacy deep-link shim (AI_CHAT_UI_UX_SPEC §0.1/§2.2). The chat IS the home
 * screen; entry points that pushed /chat?q=…&member=… land on the Ask tab,
 * where the shell consumes `q` as a queued prompt and `member` as context.
 */
export default function ChatRedirect() {
  const params = useLocalSearchParams<{ q?: string; member?: string }>();
  return (
    <Redirect
      href={{
        pathname: '/',
        params: {
          ...(typeof params.q === 'string' && params.q.length > 0 ? { q: params.q } : {}),
          ...(typeof params.member === 'string' && params.member.length > 0 ? { member: params.member } : {}),
        },
      }}
    />
  );
}