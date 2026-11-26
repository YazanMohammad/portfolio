import "@/components/admin/admin.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disableKit } from "@/lib/admin/kit";
import { useAuthMe, useLogin } from "@/lib/admin/queries";
import { ApiRequestError } from "@/lib/api";
import { AdminTitle } from "@/components/admin/useAdminTitle";

const DEFAULT_RETRY_SECONDS = 15 * 60;

function slowDownMessage(seconds?: number): string {
  const minutes = Math.max(1, Math.ceil((seconds && seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS) / 60));
  return `Too many wrong attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const me = useAuthMe();
  const login = useLogin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    disableKit();
  }, []);

  useEffect(() => {
    if (me.data?.authenticated) navigate("/admin/dashboard");
  }, [me.data, navigate]);

  const expired = new URLSearchParams(search).get("expired") === "1";
  const message = error ?? (expired ? "Your session ended. Log in again." : null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate(
      { password },
      {
        onSuccess: () => {
          queryClient.setQueryData(["auth", "me"], { authenticated: true });
          navigate("/admin/dashboard");
        },
        onError: (err) => {
          setError(
            err instanceof ApiRequestError && err.status === 429
              ? slowDownMessage(err.retryAfter)
              : err instanceof ApiRequestError && err.status === 401
                ? "Wrong password."
                : "Could not log in. Try again.",
          );
          setPassword("");
          inputRef.current?.focus();
        },
      },
    );
  }

  return (
    <main className="admin-shell admin-login min-h-screen grid place-items-center bg-background px-4 font-sans text-sm text-foreground">
      <AdminTitle title="Log in · Admin" />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-md border border-border p-6"
      >
        <p className="admin-kicker">Portfolio / Edit</p>
        <h1 className="text-3xl font-semibold">Admin login</h1>
        <p className="admin-field-hint">Sign in to update your work and read your messages.</p>
        <div role="alert" className="min-h-5 text-sm text-destructive" id="login-message">
          {message}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="login-message"
            required
            className="h-9"
          />
        </div>
        <Button type="submit" className="w-full h-9" disabled={login.isPending}>
          Log in
        </Button>
      </form>
    </main>
  );
}
