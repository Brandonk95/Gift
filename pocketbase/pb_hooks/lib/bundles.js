// Helpers for bundles.pb.js

function checkGoesWith(e) {
  const other = e.record.getString("goes_with");
  if (!other) return;
  if (other === e.record.id) throw new BadRequestError("A gift can't go with itself.");
  let target = null;
  try {
    target = e.app.findRecordById("items", other);
  } catch (_) {}
  if (!target || target.getString("list") !== e.record.getString("list")) {
    throw new BadRequestError("Pick a gift from this same list for “Goes with”.");
  }
}

module.exports = { checkGoesWith };
