import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-gray-600">Create your account</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
