export default function QRCodeDisplay({ qr }) {
    if (!qr) return null;

    const isDataUrl = typeof qr === 'string' && qr.startsWith('data:');

    if (isDataUrl) {
        return (
            <div className="bg-white p-4 rounded-lg inline-block">
                <img src={qr} alt="WhatsApp QR Code" className="w-64 h-64" />
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-lg inline-block">
            <img
                src={`data:image/png;base64,${qr}`}
                alt="WhatsApp QR Code"
                className="w-64 h-64"
                onError={(e) => {
                    e.target.style.display = 'none';
                }}
            />
        </div>
    );
}
