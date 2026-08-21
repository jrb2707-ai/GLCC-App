// Native image picker → base64 data URL, resized down so it round-trips
// through the JSON API just like the web app's client-side resizer.
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export async function pickAvatar() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    return { canceled: true, permissionDenied: true };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (result.canceled) return { canceled: true };
  const asset = result.assets?.[0];
  if (!asset?.uri) return { canceled: true };

  // Downscale to 512px and re-encode as JPEG so the resulting base64 blob
  // stays comfortably under Mongo's per-field caps.
  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 512 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) return { canceled: true };
  return { canceled: false, dataUrl: `data:image/jpeg;base64,${manipulated.base64}` };
}
