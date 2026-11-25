// 在原 doubao.link 页面开发者工具 Console 中执行本文件，下载两份旧数据；不会删除本机数据。
(() => {
  function download(key, filename) {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type:'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  download('hw_points_v3', 'records.json');
  download('hw_boxes_v3', 'boxes.json');
})();
