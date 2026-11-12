// utils/authErrors.ts
// Messages d'erreur de connexion / inscription : affichés en ligne sous le
// champ concerné (ou au-dessus du bouton), jamais en modale. Chaque message
// dit ce qui s'est passé ET quoi faire.

export type AuthErrorField = "email" | "password" | "form";

export interface AuthErrorInfo {
  field: AuthErrorField;
  message: string;
}

export function getAuthErrorInfo(
  code: string | undefined,
  mode: "login" | "signup",
): AuthErrorInfo {
  switch (code) {
    case "auth/invalid-email":
      return {
        field: "email",
        message: "Adresse email invalide. Vérifiez le format (ex. prenom@exemple.fr).",
      };
    case "auth/user-disabled":
      return {
        field: "form",
        message: "Ce compte a été désactivé. Contactez le support depuis l'aide.",
      };
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return {
        field: "form",
        message:
          "Email ou mot de passe incorrect. Vérifiez votre saisie ou utilisez « Mot de passe oublié ».",
      };
    case "auth/email-already-in-use":
      return {
        field: "email",
        message:
          "Un compte existe déjà avec cet email. Connectez-vous, ou réinitialisez le mot de passe.",
      };
    case "auth/weak-password":
      return {
        field: "password",
        message:
          "Mot de passe trop faible : 8 caractères minimum, avec 1 chiffre et 1 caractère spécial.",
      };
    case "auth/network-request-failed":
      return {
        field: "form",
        message: "Pas de connexion internet. Vérifiez le réseau, puis réessayez.",
      };
    case "auth/too-many-requests":
      return {
        field: "form",
        message: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
      };
    default:
      return {
        field: "form",
        message:
          mode === "login"
            ? "La connexion a échoué. Réessayez dans un instant."
            : "La création du compte a échoué. Réessayez dans un instant.",
      };
  }
}
