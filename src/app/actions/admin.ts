"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { formObject, runAction } from "@/server/action";
import { markNotificationsRead, updateSettings } from "@/server/services/admin";
import {
  anonymizeUser,
  approveUser,
  changeOwnPassword,
  createRole,
  rejectUser,
  setRolePermissions,
  setUserStatus,
  setVehicleAssignments,
  updateOwnPreferences,
  updateUser,
} from "@/server/services/users";
import { upsertVehicleType } from "@/server/services/vehicles";
import { saveChecklist } from "@/server/services/checks";

const path = (id: string) => `/admin/benutzer/${id}`;

export async function approveUserAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await approveUser(actor, id, { roleId: formObject(fd).roleId || undefined, vehicleIds: fd.getAll("vehicleIds").map(String).filter(Boolean) });
    revalidatePath(path(id));
    return { message: "Benutzer freigegeben." };
  });
}

export async function rejectUserAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await rejectUser(actor, id, formObject(fd).reason);
    revalidatePath(path(id));
    return { message: "Registrierung abgelehnt." };
  });
}

export async function setUserStatusAction(id: string, status: "ACTIVE" | "DISABLED" | "LOCKED"): Promise<ActionState> {
  return runAction(async (actor) => {
    await setUserStatus(actor, id, status);
    revalidatePath(path(id));
    return { message: "Status geändert." };
  });
}

export async function updateUserAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateUser(actor, id, formObject(fd));
    revalidatePath(path(id));
    return { message: "Benutzer gespeichert." };
  });
}

export async function assignVehiclesAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setVehicleAssignments(actor, id, fd.getAll("vehicleIds").map(String).filter(Boolean));
    revalidatePath(path(id));
    return { message: "Fahrzeugzuweisung gespeichert." };
  });
}

export async function anonymizeUserAction(id: string): Promise<ActionState> {
  return runAction(async (actor) => {
    await anonymizeUser(actor, id);
    revalidatePath(path(id));
    return { message: "Benutzer anonymisiert." };
  });
}

export async function setRolePermissionsAction(roleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setRolePermissions(actor, roleId, fd.getAll("permissions").map(String));
    revalidatePath("/admin/rollen");
    return { message: "Berechtigungen gespeichert." };
  });
}

export async function createRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const o = formObject(fd);
    await createRole(actor, { key: o.key, name: o.name, description: o.description });
    revalidatePath("/admin/rollen");
    return { message: "Rolle angelegt." };
  });
}

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const o = formObject(fd);
    await updateSettings(actor, {
      organizationName: o.organizationName,
      expiryWarningDays: Number(o.expiryWarningDays),
      medicationsEnabled: fd.get("medicationsEnabled") === "on",
      emailNotificationsEnabled: fd.get("emailNotificationsEnabled") === "on",
      multiVehicleAssignmentEnabled: fd.get("multiVehicleAssignmentEnabled") === "on",
    });
    revalidatePath("/admin/einstellungen");
    return { message: "Einstellungen gespeichert." };
  });
}

export async function upsertVehicleTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const o = formObject(fd);
    await upsertVehicleType(actor, { id: o.id || undefined, name: o.name, description: o.description, archived: fd.get("archived") === "on" });
    revalidatePath("/admin/einstellungen");
    return { message: "Fahrzeugtyp gespeichert." };
  });
}

export async function saveChecklistAction(json: string): Promise<ActionState> {
  return runAction(async (actor) => {
    await saveChecklist(actor, JSON.parse(json));
    revalidatePath("/admin/checklisten");
    return { message: "Checkliste gespeichert." };
  });
}

export async function markReadAction(ids?: string[]): Promise<ActionState> {
  return runAction(async (actor) => {
    await markNotificationsRead(actor, ids);
    revalidatePath("/benachrichtigungen");
    return { message: "Als gelesen markiert." };
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const o = formObject(fd);
    await changeOwnPassword(actor, o.current, o.password, o.passwordConfirm);
    return { message: "Passwort geändert." };
  });
}

export async function updatePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateOwnPreferences(actor, fd.get("emailNotifications") === "on");
    return { message: "Einstellungen gespeichert." };
  });
}
