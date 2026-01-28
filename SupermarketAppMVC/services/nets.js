const axios = require("axios");

exports.generateQrCode = async (req, res) => {
  // Accept amount from multiple fields to match checkout form
  const amountVal = req.body.finalTotal || req.body.cartTotal || req.body.amount || 0;
  const cartTotal = parseFloat(amountVal) || 0;
  console.log('NETS QR requested amount:', cartTotal);
  try {
    const requestBody = {
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b", // Default for testing
      amt_in_dollars: cartTotal,
      notify_mobile: 0,
    };

    const response = await axios.post(
      `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
      requestBody,
      {
        headers: {
          "api-key": process.env.API_KEY,
          "project-id": process.env.PROJECT_ID,
        },
      }
    );

    const getCourseInitIdParam = () => {
      try {
        require.resolve("./../course_init_id");
        const { courseInitId } = require("../course_init_id");
        console.log("Loaded courseInitId:", courseInitId);

        return courseInitId ? `${courseInitId}` : "";
      } catch (error) {
        return "";
      }
    };

    const qrData = response.data && response.data.result ? response.data.result.data : null;
    console.log("NETS QR raw response:", JSON.stringify(response.data, null, 2));

    if (
      qrData &&
      qrData.response_code === "00" &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log("QR code generated successfully");

      // Store transaction retrieval reference for later use
      const txnRetrievalRef = qrData.txn_retrieval_ref;
      const courseInitId = getCourseInitIdParam();

      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      console.log("Transaction retrieval ref:" + txnRetrievalRef);
      console.log("courseInitId:" + courseInitId);
      console.log("webhookUrl:" + webhookUrl);

      
      // derive delivery info from the original request so we can finalize later
      const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
      const deliveryType = req.body.deliveryType || (req.body.deliveryOption || 'doorstep');
      const address = req.body.address || '';

      // Render the QR code page with required data
      res.render("netsQr", {
        total: cartTotal,
        title: "Scan to Pay",
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef: txnRetrievalRef,
        courseInitId: courseInitId,
        networkCode: qrData.network_status,
        timer: 300, // Timer in seconds
        webhookUrl: webhookUrl,
        fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
        deliveryFee,
        deliveryType,
        address
      });
    } else {
      // Handle partial or failed responses
      let errorMsg = "An error occurred while generating the QR code.";
      if (qrData) {
        if (qrData.network_status !== 0) {
          errorMsg = qrData.error_message || "Transaction failed. Please try again.";
        }
      } else {
        errorMsg = "Invalid NETS response.";
      }
      res.render("netsTxnFailStatus", {
        title: "Payment Error",
        responseCode: (qrData && qrData.response_code) || "N.A.",
        instructions: (qrData && qrData.instruction) || "",
        message: errorMsg,
      });
    }
  } catch (error) {
    const apiError = error && error.response ? error.response.data : null;
    console.error("Error in generateQrCode:", error.message, apiError ? JSON.stringify(apiError) : "");
    const msg = apiError && apiError.message ? apiError.message : "Failed to contact NETS QR API";
    res.render("netsTxnFailStatus", {
      title: "Payment Error",
      responseCode: (apiError && apiError.code) || "N.A.",
      instructions: "",
      message: msg,
    });
  }
};
