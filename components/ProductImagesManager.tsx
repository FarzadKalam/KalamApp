import React, { useEffect, useState } from 'react';
import { Modal, Upload, Button, Image, message } from 'antd';
import { UploadOutlined, ArrowUpOutlined, ArrowDownOutlined, StarOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';

interface ProductImagesManagerProps {
  open: boolean;
  onClose: () => void;
  productId?: string;
  mainImage?: string | null;
  onMainImageChange?: (url: string | null) => void;
  canEdit?: boolean;
}

const MAX_IMAGES = 6;

const ProductImagesManager: React.FC<ProductImagesManagerProps> = ({
  open,
  onClose,
  productId,
  mainImage,
  onMainImageChange,
  canEdit = true,
}) => {
  const [images, setImages] = useState<Array<{ id: string; image_url: string; sort_order: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadImages = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('product_images')
        .select('id, image_url, sort_order')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      const normalized = (data || []).map((img: any, idx: number) => ({
        id: img.id,
        image_url: img.image_url,
        sort_order: Number.isFinite(img.sort_order) ? img.sort_order : idx,
      }));
      setImages(normalized);
    } catch (err) {
      console.warn('Could not load product images', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadImages();
  }, [open, productId]);

  const uploadToStorage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleAddImage = async (file: File) => {
    if (!productId) {
      message.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    if (images.length >= MAX_IMAGES) {
      message.warning('حداکثر ۶ تصویر مجاز است');
      return false;
    }

    try {
      setUploading(true);
      const url = await uploadToStorage(file);
      const nextOrder = images.length;
      const { data, error } = await supabase
        .from('product_images')
        .insert([{ product_id: productId, image_url: url, sort_order: nextOrder }])
        .select('id, image_url, sort_order')
        .single();
      if (error) throw error;
      setImages((prev) => [...prev, data]);
      if (!mainImage && onMainImageChange) onMainImageChange(url);
      message.success('تصویر اضافه شد');
    } catch (err: any) {
      message.error('خطا در ثبت تصویر: ' + err.message);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDelete = async (imageId: string) => {
    try {
      const target = images.find((img) => img.id === imageId);
      await supabase.from('product_images').delete().eq('id', imageId);
      const nextImages = images.filter((img) => img.id !== imageId);
      setImages(nextImages);
      if (target?.image_url && target.image_url === mainImage && onMainImageChange) {
        onMainImageChange(nextImages[0]?.image_url || null);
      }
      message.success('تصویر حذف شد');
    } catch (err: any) {
      message.error('حذف تصویر ناموفق بود');
    }
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const current = images[index];
    const target = images[nextIndex];

    const updated = [...images];
    updated[index] = { ...target, sort_order: current.sort_order };
    updated[nextIndex] = { ...current, sort_order: target.sort_order };
    setImages(updated);

    try {
      await supabase.from('product_images').update({ sort_order: updated[index].sort_order }).eq('id', updated[index].id);
      await supabase.from('product_images').update({ sort_order: updated[nextIndex].sort_order }).eq('id', updated[nextIndex].id);
    } catch (err) {
      message.error('بروزرسانی ترتیب ناموفق بود');
      setImages(images);
    }
  };

  const handleSetMain = (url: string) => {
    if (onMainImageChange) onMainImageChange(url);
  };

  return (
    <Modal
      title="مدیریت تصاویر محصول"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      zIndex={5000}
    >
      {!productId && (
        <div className="text-xs text-gray-500">ابتدا رکورد را ذخیره کنید.</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
        {images.map((img, idx) => (
          <div key={img.id} className="relative group border border-gray-100 rounded-lg p-1">
            <Image src={img.image_url} className="rounded" />
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveImage(idx, -1)} disabled={!canEdit || idx === 0} />
              <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveImage(idx, 1)} disabled={!canEdit || idx === images.length - 1} />
            </div>
            <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <Button size="small" icon={<StarOutlined />} onClick={() => handleSetMain(img.image_url)} disabled={!canEdit}>
                تصویر اصلی
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(img.id)} disabled={!canEdit}>
                حذف
              </Button>
            </div>
            {mainImage === img.image_url && (
              <div className="absolute top-1 left-1 text-[10px] bg-leather-500 text-white px-2 py-0.5 rounded-full">
                اصلی
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Upload
          listType="picture-card"
          showUploadList={false}
          beforeUpload={handleAddImage}
          disabled={uploading || !productId || images.length >= MAX_IMAGES || !canEdit}
          fileList={[]}
        >
          <div>
            <UploadOutlined />
            <div style={{ marginTop: 8 }}>افزودن تصویر</div>
          </div>
        </Upload>
        <div className="text-xs text-gray-400">
          {images.length}/{MAX_IMAGES} تصویر
        </div>
      </div>

      {loading && <div className="text-xs text-gray-500 mt-2">در حال بارگذاری...</div>}
    </Modal>
  );
};

export default ProductImagesManager;
