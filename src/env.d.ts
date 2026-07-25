/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: {
      id: string;
      email: string;
      role: string;
    } | null;
  }
}
