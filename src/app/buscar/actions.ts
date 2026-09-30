"use server";

import { redirect } from "next/navigation";
import { requireBuyer } from "@/lib/auth";
import { createRequestSchema } from "@/lib/validators/request";
import { createRequest } from "@/lib/services/requests";

export type CreateRequestState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createRequestAction(
  _prev: CreateRequestState,
  formData: FormData,
): Promise<CreateRequestState> {
  const user = await requireBuyer();
  const raw = Object.fromEntries(formData.entries());

  const parsed = createRequestSchema.safeParse({
    operationType: raw.operationType,
    propertyType: raw.propertyType,
    provincia: raw.provincia,
    ciudad: raw.ciudad,
    sector: raw.sector,
    priceMin: raw.priceMin,
    priceMax: raw.priceMax,
    bedrooms: raw.bedrooms || undefined,
    bathrooms: raw.bathrooms || undefined,
    minSquareMeters: raw.minSquareMeters || undefined,
    parkingSpots: raw.parkingSpots || undefined,
    moveInDate: raw.moveInDate || undefined,
    occupation: raw.occupation,
    searchReason: raw.searchReason,
    additionalNotes: raw.additionalNotes,
    features: {
      furnished: raw.furnished === "on",
      hasElevator: raw.hasElevator === "on",
      hasTerrace: raw.hasTerrace === "on",
      hasPatio: raw.hasPatio === "on",
      hasPool: raw.hasPool === "on",
      hasSecurity: raw.hasSecurity === "on",
      propertyAgeYears: raw.propertyAgeYears || undefined,
      otherFeature: raw.otherFeature,
    },
    contactName: raw.contactName,
    contactPhone: raw.contactPhone,
    contactEmail: raw.contactEmail,
    contactPreference: raw.contactPreference,
    maxAgents: raw.maxAgents || "3",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "Revisa los campos marcados.", fieldErrors };
  }

  const request = await createRequest(user.buyerProfileId!, parsed.data);
  redirect(`/dashboard/buyer/solicitudes/${request.id}?created=1`);
}
