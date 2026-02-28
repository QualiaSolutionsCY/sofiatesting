import Form from "next/form";
import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({
  action,
  children,
  defaultEmail = "",
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  const validateEmail = (candidateEmail: string) => {
    return EMAIL_REGEX.test(candidateEmail);
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (formData: FormData) => {
    if (validateForm() && typeof action === "function") {
      action(formData);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-center font-bold text-2xl">
          Sign in to SOPHIA
        </CardTitle>
        <p className="text-center text-muted-foreground text-sm">
          Enter your credentials to access the AI assistant
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-medium text-sm" htmlFor="email">
              Email Address
            </Label>
            <Input
              autoComplete="email"
              autoFocus
              className="bg-background"
              error={!!errors.email}
              id="email"
              name="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              type="email"
              value={email}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-medium text-sm" htmlFor="password">
              Password
            </Label>
            <div className="relative">
              <Input
                autoComplete="current-password"
                className="bg-background pr-10"
                error={!!errors.password}
                id="password"
                name="password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <Button
                className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {showPassword ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password}</p>
            )}
          </div>

          {children}
        </Form>
      </CardContent>
    </Card>
  );
}
