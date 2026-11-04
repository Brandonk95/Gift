// Turns PocketBase errors into messages a person can act on.
//
// PocketBase responds with { status, message, data: { field: { code, message, params } } }.
// `action` is a short verb phrase ("save this gift") used to explain what failed.

const FIELD_LABELS = {
  identity: "Email",
  email: "Email",
  password: "Password",
  passwordConfirm: "Password confirmation",
  oldPassword: "Current password",
  name: "Name",
  title: "List name",
  description: "Details",
  occasion: "Occasion",
  event_date: "Date",
  url: "Link",
  image_url: "Image URL",
  image: "Picture",
  price: "Price",
  quantity: "Quantity",
  priority: "Priority",
  category: "Category",
  icon: "Icon",
  share_token: "Share link",
  item: "Gift",
  list: "List",
};

// Messages PocketBase uses when it has nothing more specific to say.
const GENERIC_MESSAGES = [
  "Failed to create record.",
  "Failed to update record.",
  "Failed to delete record.",
  "Failed to authenticate.",
  "Something went wrong while processing your request.",
  "An error occurred while validating the submitted data.",
  "The requested resource wasn't found.",
];

function label(field) {
  return FIELD_LABELS[field] || field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatBytes(n) {
  if (!n) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n % (1024 * 1024) ? 1 : 0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function fieldMessage(field, err) {
  const name = label(field);
  const p = err.params || {};
  switch (err.code) {
    case "validation_required":
      return field === "identity" ? "Enter the email address you signed up with." : `${name} is required — please fill it in.`;
    case "validation_not_unique":
      if (field === "email") {
        return "An account with this email already exists. Log in instead, or use “Forgot password?” to reset your password.";
      }
      if (field === "item") return "Someone else just reserved this gift. The list has been refreshed.";
      return `That ${name.toLowerCase()} is already in use. Pick a different one.`;
    case "validation_values_mismatch":
      return "The password and confirmation don't match. Retype them so they're exactly the same.";
    case "validation_invalid_old_password":
      return "Your current password is incorrect. Enter the password you use to log in now.";
    case "validation_invalid_email":
    case "validation_is_email":
      return `${name} isn't a valid email address. It should look like name@example.com.`;
    case "validation_invalid_url":
    case "validation_is_url":
      return `${name} must be a full web address starting with http:// or https:// (for example https://store.com/product).`;
    case "validation_min_number_constraint":
      return `${name} can't be less than ${p.min ?? 0}.`;
    case "validation_max_number_constraint":
      return `${name} can't be more than ${p.max}.`;
    case "validation_only_int_constraint":
      return `${name} must be a whole number.`;
    case "validation_min_text_constraint":
    case "validation_length_too_short":
      return p.min ? `${name} must be at least ${p.min} characters long.` : `${name} is too short. ${err.message}`;
    case "validation_max_text_constraint":
    case "validation_length_too_long":
      return p.max ? `${name} can be at most ${p.max} characters long.` : `${name} is too long. ${err.message}`;
    case "validation_length_out_of_range":
      return `${name}: ${err.message}`;
    case "validation_file_size_limit":
      return `“${p.file || "That file"}” is too big. Pictures must be ${formatBytes(p.maxSize) || "5 MB"} or smaller — try a smaller image or a screenshot.`;
    case "validation_invalid_mime_type":
      return `That file isn't a supported picture. Use a JPG, PNG, WebP or GIF image.`;
    case "validation_invalid_format":
    case "validation_match_invalid":
      return `${name} contains characters that aren't allowed.`;
    case "validation_invalid_value":
    case "validation_missing_rel_records":
      return `The selected ${name.toLowerCase()} doesn't exist anymore. Refresh the page and pick another one.`;
    default:
      return `${name}: ${err.message || "is invalid."}`;
  }
}

export function errorMessage(err, action = "complete that") {
  if (!err) return `Couldn't ${action}. Please try again.`;

  // Plain JS errors (not from the API)
  if (err.status === undefined && !err.response) {
    return `Couldn't ${action}: ${err.message || "an unexpected error occurred"}. Please try again.`;
  }

  const status = err.status;
  const response = err.response || {};
  const data = response.data && typeof response.data === "object" ? response.data : {};
  const serverMsg = response.message || "";
  const isGeneric = !serverMsg || GENERIC_MESSAGES.includes(serverMsg);

  const fields = Object.entries(data).filter(([, v]) => v && typeof v === "object" && (v.code || v.message));
  if (fields.length) return fields.map(([f, v]) => fieldMessage(f, v)).join("\n");

  if (err.isAbort) return `Couldn't ${action} because the request was cancelled. Please try again.`;
  if (status === 0) {
    return `Couldn't ${action} because the server can't be reached. Check your internet connection — if you're online, the server may be down or restarting. Try again in a moment.`;
  }
  if (status === 401) return `Couldn't ${action} because your login session has expired. Log out and log back in, then try again.`;
  if (status === 403) return isGeneric ? `You don't have permission to ${action}.` : serverMsg;
  if (status === 404) {
    return isGeneric
      ? `Couldn't ${action} because it no longer exists — it may have been deleted (or, on a shared list, the owner reset the link). Refresh the page to see the latest version.`
      : serverMsg;
  }
  if (status === 413) return `Couldn't ${action} because the upload is too large. Pictures must be 5 MB or smaller.`;
  if (status === 429) return `Couldn't ${action} because there were too many attempts in a short time. Wait a minute, then try again.`;
  if (status >= 500) {
    return `The server hit an unexpected problem while trying to ${action} (error ${status}). Try again in a moment — if it keeps happening, contact the site admin.`;
  }
  if (!isGeneric) return serverMsg;
  return `Couldn't ${action}. The server rejected the request — you may not have permission, or the data changed since the page loaded. Refresh the page and try again.`;
}
