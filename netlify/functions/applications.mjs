import { getStore } from "@netlify/blobs";

const store = getStore("setugov-applications");
const allowedStatuses = new Set(["Pending", "Under Review", "Approved", "Rejected"]);
const editableFields = new Set(["status", "step", "officerNotes"]);

function jsonResponse(statusCode, payload) {
    return new Response(JSON.stringify(payload), {
        status: statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

function authorizeAdministrator(request) {
    const configuredKey = process.env.SETUGOV_ADMIN_KEY;
    if (!configuredKey) {
        return jsonResponse(503, { error: "Administrator access has not been configured for this deployment." });
    }
    if (request.headers.get("authorization") !== `Bearer ${configuredKey}`) {
        return jsonResponse(401, { error: "Administrator authorization is required." });
    }
    return null;
}

async function readApplications() {
    const records = [];
    let cursor;

    do {
        const page = await store.list({ prefix: "application:", cursor });
        const pageRecords = await Promise.all(
            page.blobs.map(async ({ key }) => store.get(key, { type: "json" }))
        );
        records.push(...pageRecords.filter(Boolean));
        cursor = page.cursor;
    } while (cursor);

    return records.sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
}

function normalizeApplication(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;

    const requiredText = ["service", "applicantName"];
    if (requiredText.some((field) => typeof input[field] !== "string" || !input[field].trim())) {
        return null;
    }

    const id = crypto.randomUUID();
    const ackSuffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
    return {
        id,
        ackId: `ACK-${input.service.slice(0, 3).toUpperCase()}-${ackSuffix}`,
        service: input.service.trim().slice(0, 120),
        applicantName: input.applicantName.trim().slice(0, 120),
        applicantEmail: typeof input.applicantEmail === "string" ? input.applicantEmail.trim().slice(0, 160) : "",
        applicantPhone: typeof input.applicantPhone === "string" ? input.applicantPhone.trim().slice(0, 40) : "",
        dob: typeof input.dob === "string" ? input.dob.slice(0, 10) : "",
        ssn: typeof input.ssn === "string" ? input.ssn.trim().slice(0, 32) : "",
        address: typeof input.address === "string" ? input.address.trim().slice(0, 240) : "",
        city: typeof input.city === "string" ? input.city.trim().slice(0, 100) : "",
        state: typeof input.state === "string" ? input.state.trim().slice(0, 100) : "",
        zip: typeof input.zip === "string" ? input.zip.trim().slice(0, 20) : "",
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        status: "Pending",
        step: 1,
        officerNotes: "Submitted by citizen via web portal"
    };
}

export default async (request) => {
    try {
        if (request.method === "GET") {
            const authorizationError = authorizeAdministrator(request);
            if (authorizationError) return authorizationError;
            return jsonResponse(200, { applications: await readApplications() });
        }

        if (request.method === "POST") {
            let input;
            try {
                input = await request.json();
            } catch {
                return jsonResponse(400, { error: "The request body must be valid JSON." });
            }
            const application = normalizeApplication(input);
            if (!application) {
                return jsonResponse(400, { error: "A service and applicant name are required." });
            }

            await store.setJSON(`application:${application.id}`, application);
            return jsonResponse(201, { application });
        }

        if (request.method === "PATCH") {
            const authorizationError = authorizeAdministrator(request);
            if (authorizationError) return authorizationError;
            let input;
            try {
                input = await request.json();
            } catch {
                return jsonResponse(400, { error: "The request body must be valid JSON." });
            }
            if (!input || typeof input.id !== "string" || !input.id.trim()) {
                return jsonResponse(400, { error: "An application ID is required." });
            }

            const updates = {};
            for (const [field, value] of Object.entries(input)) {
                if (editableFields.has(field)) updates[field] = value;
            }
            if (Object.keys(updates).length === 0) {
                return jsonResponse(400, { error: "No supported application updates were provided." });
            }
            if ("status" in updates && !allowedStatuses.has(updates.status)) {
                return jsonResponse(400, { error: "The requested application status is invalid." });
            }
            if ("step" in updates && (!Number.isInteger(updates.step) || updates.step < 1 || updates.step > 4)) {
                return jsonResponse(400, { error: "The application step must be between 1 and 4." });
            }
            if ("officerNotes" in updates && typeof updates.officerNotes !== "string") {
                return jsonResponse(400, { error: "Officer remarks must be text." });
            }

            const key = `application:${input.id}`;
            const application = await store.get(key, { type: "json" });
            if (!application) return jsonResponse(404, { error: "Application not found." });

            const updatedApplication = {
                ...application,
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await store.setJSON(key, updatedApplication);
            return jsonResponse(200, { application: updatedApplication });
        }

        return jsonResponse(405, { error: "Method not allowed." });
    } catch (error) {
        console.error("Shared applications function failed:", error);
        return jsonResponse(500, { error: "The shared application ledger is temporarily unavailable." });
    }
};
