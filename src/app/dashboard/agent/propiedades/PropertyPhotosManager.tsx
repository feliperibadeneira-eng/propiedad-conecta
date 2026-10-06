"use client";

import { useActionState } from "react";
import {
  addPropertyPhotosAction,
  deletePropertyPhotoAction,
  setPrimaryPropertyPhotoAction,
  movePropertyPhotoLeftAction,
  movePropertyPhotoRightAction,
  type PhotoActionState,
} from "./[id]/actions";
import { PhotoPicker } from "./PhotoPicker";
import { Card } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { propertyPhotoUrl } from "@/lib/propertyPhotos";
import { MAX_IMAGES_PER_PROPERTY } from "@/lib/propertyPhotoRules";

const initialState: PhotoActionState = {};

export type ManagedPhoto = { id: string; isPrimary: boolean };

export function PropertyPhotosManager({
  propertyId,
  photos,
}: {
  propertyId: string;
  photos: ManagedPhoto[];
}) {
  const uploadAction = addPropertyPhotosAction.bind(null, propertyId);
  const [state, formAction, pending] = useActionState(uploadAction, initialState);
  const remainingSlots = MAX_IMAGES_PER_PROPERTY - photos.length;

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Fotos de la propiedad</h2>
        <span className="text-xs text-muted-2">
          {photos.length}/{MAX_IMAGES_PER_PROPERTY}
        </span>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no has agregado fotos.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {photos.map((photo, i) => (
            <div key={photo.id} className="w-28 space-y-1.5">
              <div className="relative h-24 w-28 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={propertyPhotoUrl(photo.id)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {photo.isPrimary && (
                  <Badge tone="accent" className="absolute left-1 top-1">
                    Portada
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-center gap-1">
                <form action={movePropertyPhotoLeftAction.bind(null, propertyId, photo.id)}>
                  <button
                    type="submit"
                    disabled={i === 0}
                    aria-label="Mover a la izquierda"
                    className={buttonClasses("ghost", "sm", "px-1.5 disabled:opacity-20")}
                  >
                    ←
                  </button>
                </form>
                <form action={movePropertyPhotoRightAction.bind(null, propertyId, photo.id)}>
                  <button
                    type="submit"
                    disabled={i === photos.length - 1}
                    aria-label="Mover a la derecha"
                    className={buttonClasses("ghost", "sm", "px-1.5 disabled:opacity-20")}
                  >
                    →
                  </button>
                </form>
                <form action={deletePropertyPhotoAction.bind(null, propertyId, photo.id)}>
                  <button
                    type="submit"
                    className={buttonClasses("ghost", "sm", "px-1.5 text-danger")}
                  >
                    Eliminar
                  </button>
                </form>
              </div>
              {!photo.isPrimary && (
                <form action={setPrimaryPropertyPhotoAction.bind(null, propertyId, photo.id)}>
                  <button type="submit" className="w-full text-xs text-accent hover:underline">
                    Marcar portada
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {remainingSlots > 0 && (
        <form action={formAction} className="space-y-3 border-t border-border pt-4">
          {/* key={photos.length}: fuerza a remontar el picker (y descartar
              sus previews) cada vez que la cantidad de fotos guardadas
              cambia — si no, después de subir con éxito, el picker seguía
              mostrando la preview de un archivo que el <input> real ya
              había vaciado. */}
          <PhotoPicker key={photos.length} name="photos" maxFiles={remainingSlots} />
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Subiendo..." : "Agregar fotos"}
          </Button>
        </form>
      )}
    </Card>
  );
}
