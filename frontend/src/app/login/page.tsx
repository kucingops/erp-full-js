"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TokenResponse } from "@/lib/types";

const schema = z.object({
  email: z.email("Email tidak valid"),
  password: z.string().min(6, "Minimal 6 karakter"),
});
type FormValues = z.infer<typeof schema>;

const DEMO = [
  ["Admin", "admin@erp.local", "Admin123!"],
  ["Gudang", "gudang@erp.local", "Gudang123!"],
  ["Sales", "sales@erp.local", "Sales123!"],
  ["Purchasing", "purchasing@erp.local", "Purchasing123!"],
] as const;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: FormValues) =>
      api<TokenResponse>("/auth/login", { method: "POST", body: values, auth: false }),
    onSuccess: (session) => {
      setSession(session);
      toast.success(`Selamat datang, ${session.user.name}`);
      router.replace("/");
    },
    onError: (e) => toast.error(e.message),
  });

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Mini ERP</CardTitle>
          <CardDescription>Masuk ke akun kamu</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((v) => login.mutate(v))}
          >
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? "Memproses..." : "Masuk"}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
            <p className="mb-2">Akun demo (klik untuk isi):</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map(([label, email, password]) => (
                <Button
                  key={email}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    form.setValue("email", email);
                    form.setValue("password", password);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
