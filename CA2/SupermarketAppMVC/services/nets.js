const axios = require("axios");

exports.generateQrCode = async (req, res) => {
  // Accept amount from multiple fields to match checkout form
  const amountVal = req.body.finalTotal || req.body.cartTotal || req.body.amount || 0;
  const cartTotal = parseFloat(amountVal) || 0;
  console.log('NETS QR requested amount:', cartTotal);
  console.log('API_KEY present:', !!process.env.API_KEY, 'Length:', process.env.API_KEY?.length);
  console.log('PROJECT_ID present:', !!process.env.PROJECT_ID, 'Length:', process.env.PROJECT_ID?.length);

  if (!process.env.API_KEY || !process.env.PROJECT_ID) {
    return res.render('netsTxnFailStatus', {
      title: 'Configuration Error',
      responseCode: 'CONFIG_ERROR',
      instructions: '',
      message: 'NETS API credentials not configured. Please check .env file.',
      rawResponse: { error: 'Missing API_KEY or PROJECT_ID in environment variables' }
    });
  }

  const requestBody = {
    txn_id: 'sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b',
    amt_in_dollars: cartTotal,
    notify_mobile: 0
  };

  console.log('NETS request body:', requestBody);

  try {
    const response = await axios.post(
      'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request',
      requestBody,
      {
        headers: {
          'api-key': process.env.API_KEY,
          'project-id': process.env.PROJECT_ID,
          'Content-Type': 'application/json'
        },
        timeout: 60000,
        validateStatus: (status) => status < 600
      }
    );

    console.log('NETS raw response:', JSON.stringify(response.data, null, 2));

    const qrData = response.data && response.data.result && response.data.result.data ? response.data.result.data : null;

    if (!qrData) {
      console.error('NETS response missing result.data structure');
      return res.render('netsTxnFailStatus', {
        title: 'Payment Error',
        responseCode: 'N.A.',
        instructions: 'Invalid response structure from NETS API',
        message: 'NETS did not return valid data. Check API credentials.',
        rawResponse: response.data
      });
    }

    if (qrData.response_code === '00' && qrData.txn_status === 1 && qrData.qr_code) {
      const txnRetrievalRef = qrData.txn_retrieval_ref || null;
      const courseInitId = (function(){ try { const { courseInitId } = require('../course_init_id'); return courseInitId || ''; } catch(e){ return ''; } })();
      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      // derive delivery info
      const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
      const deliveryType = req.body.deliveryType || (req.body.deliveryOption || 'doorstep');
      const address = req.body.address || '';

      return res.render('netsQr', {
        total: cartTotal,
        title: 'Scan to Pay',
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef,
        courseInitId,
        networkCode: qrData.network_status,
        timer: 300,
        webhookUrl,
        fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
        deliveryFee,
        deliveryType,
        address
      });
    }

    // NETS returned data but QR generation failed
    console.error('NETS QR generation failed. Response code:', qrData.response_code, 'Status:', qrData.txn_status);
    return res.render('netsTxnFailStatus', {
      title: 'Payment Error',
      responseCode: qrData.response_code || 'N.A.',
      instructions: qrData.instruction || qrData.error_message || '',
      message: `NETS QR generation failed: ${qrData.error_message || 'Invalid response code or missing QR code'}`,
      rawResponse: response.data
    });
  } catch (error) {
    console.error('Error in generateQrCode:', error && error.message ? error.message : error);
    const apiError = error && error.response ? error.response.data : null;
    console.error('NETS API error response:', apiError ? JSON.stringify(apiError, null, 2) : 'No response data');
    
    let errorMsg = 'Failed to contact NETS API';
    if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
      errorMsg = 'NETS API request timed out after 30 seconds. The NETS sandbox may be slow or unavailable. Please try again or contact support if the issue persists.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMsg = 'Could not connect to NETS API. Please check your network connection.';
    } else if (apiError) {
      errorMsg = apiError.message || apiError.error || 'NETS API returned an error';
    }

    return res.render('netsTxnFailStatus', {
      title: 'Payment Error',
      responseCode: (apiError && (apiError.code || apiError.response_code)) || error.code || 'N.A.',
      instructions: (apiError && apiError.instruction) || '',
      message: errorMsg,
      rawResponse: apiError || { error: error.message, code: error.code, requestBody: requestBody }
    });
  }
};
