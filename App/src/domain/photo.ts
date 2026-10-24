import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// A road photo for a report: taken with the camera or picked from the gallery, then shrunk and
// re-saved as JPEG. Re-saving drops the original file's metadata (EXIF), including where it was taken;
// the report already carries its place on NH-7.

export interface ReportPhoto {
  uri: string;
  width: number;
  height: number;
}

const MAX_SIDE = 1600;

export type PhotoSource = 'camera' | 'library';

/** null when the person cancels. Throws 'permission' when access was refused. */
export async function getReportPhoto(source: PhotoSource): Promise<ReportPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('permission');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('permission');
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
