```js
async function changeCategoryImage(categoryId, input) {
    const file = input?.files?.[0];

    if (!file) {
        alert('من فضلك اختر صورة أولاً.');
        return;
    }

    const token = sessionStorage.getItem('OSCAR_ADMIN_ACCESS_TOKEN');

    if (!token) {
        alert('انتهت جلسة الدخول. سجل دخول لوحة التحكم مرة أخرى.');
        switchView('admin-login');
        return;
    }

    try {
        // =========================
        // تحويل الصورة إلى Base64
        // =========================

        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(
                new Error('فشل قراءة الصورة')
            );

            reader.readAsDataURL(file);
        });

        // =========================
        // رفع الصورة
        // =========================

        const uploadResponse = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fileName: file.name,
                contentType: file.type,
                base64: base64
            })
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadData.success) {
            throw new Error(
                uploadData?.error || 'فشل رفع الصورة'
            );
        }

        const imageUrl = uploadData.url;

        if (!imageUrl) {
            throw new Error(
                'تم رفع الصورة ولكن لم يتم الحصول على رابط الصورة'
            );
        }

        // =========================
        // تحديث صورة القسم في قاعدة البيانات
        // =========================

        const response = await fetch(
            `/api/categories?id=${encodeURIComponent(categoryId)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    image_url: imageUrl
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data?.error || 'فشل تحديث صورة القسم'
            );
        }

        // =========================
        // تحديث الصورة مباشرة
        // =========================

        const category = appState.categories.find(
            c => c.id === categoryId
        );

        if (category) {
            category.image_url = imageUrl;
        }

        renderCategoriesGrid();
        renderAdminCategories();

        alert('تم تغيير صورة القسم بنجاح ✅');

    } catch (error) {
        console.error(
            'CHANGE CATEGORY IMAGE ERROR:',
            error
        );

        alert(
            error?.message ||
            'حدث خطأ أثناء تغيير صورة القسم'
        );

        if (input) {
            input.value = '';
        }
    }
}
```
