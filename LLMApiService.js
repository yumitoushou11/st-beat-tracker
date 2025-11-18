import {EDITOR, USER} from './src/engine-adapter.js';
import { getRequestHeaders } from '/script.js';
let ChatCompletionService = undefined;
try {
    // 动态导入，兼容模块不存在的情况
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    console.warn("未检测到 /scripts/custom-request.js 或未正确导出 ChatCompletionService，将禁用代理相关功能。", e);
}
export class LLMApiService {
    constructor(config = {}, dependencies = {}) {
        this.config = {
            api_provider: config.api_provider || 'direct_openai', // 新增：API提供商策略
            api_url: config.api_url || "",
            api_key: config.api_key || "",
            model_name: config.model_name || "",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 63000,
            stream: config.stream || false
        };

        this.deps = dependencies;
        this.EDITOR = this.deps.EDITOR;
        this.USER = this.deps.USER;
    }
   /**
     *  动态更新API配置。
     * 这个新版本能够智能地将外部传入的驼峰命名（如 apiUrl）
     * 映射到内部使用的下划线命名（如 api_url），从而解决数据不匹配问题。
     * @param {object} newConfig - 新的配置项，例如 { apiUrl: "...", apiKey: "..." }
     */
    updateConfig(newConfig) {
        // API提供商策略
        if (newConfig.apiProvider !== undefined) this.config.api_provider = newConfig.apiProvider;
        if (newConfig.api_provider !== undefined) this.config.api_provider = newConfig.api_provider;

        if (newConfig.apiUrl !== undefined) this.config.api_url = newConfig.apiUrl;
        if (newConfig.api_url !== undefined) this.config.api_url = newConfig.api_url;

        if (newConfig.apiKey !== undefined) this.config.api_key = newConfig.apiKey;
        if (newConfig.api_key !== undefined) this.config.api_key = newConfig.api_key;

        if (newConfig.modelName !== undefined) this.config.model_name = newConfig.modelName;
        if (newConfig.model_name !== undefined) this.config.model_name = newConfig.model_name;

        if (newConfig.temperature !== undefined) this.config.temperature = newConfig.temperature;

        console.info("[LLMApiService] 配置已更新。提供商:", this.config.api_provider, "| URL:", this.config.api_url ? "已设置" : "空");
    }
async testConnection() {
    if (!this.config.api_url || !this.config.api_key) {
        throw new Error("API URL 和 API Key 不能为空。请先在设置中填写。");
    }

    console.info(`[LLMApiService] 正在使用模型 [${this.config.model_name}] 测试连接...`);

    const testMessages = [{ role: 'user', content: "Hello! Please reply with only one word: 'Success'." }];

    try {
        const responseText = await this.#executeApiCall(testMessages, null);
        
        if (responseText && responseText.toLowerCase().includes('success')) {
            return `连接成功！模型返回: "${responseText}"`;
        } else {
            throw new Error(`连接看似成功，但模型返回了非预期的内容: "${responseText || '空内容'}"`);
        }

    } catch (error) {
        console.error("[LLMApiService] 连接测试失败", error);
        let detail = error.message || error.toString() || '未知错误';
        if (detail && typeof detail === 'string') {
            if (detail.includes('401')) {
                detail = '认证失败 (401)。请检查你的 API Key 是否正确。';
            } else if (detail.includes('404')) {
                detail = '未找到端点 (404)。请检查你的 API URL 是否正确，特别是对于非官方API，URL需要是完整的。';
            } else if (detail.includes('Failed to fetch')) {
                detail = '网络请求失败。请检查你的网络连接、代理设置，或确认API地址是否可以访问。';
            }
        }
        throw new Error(`连接测试失败: ${detail}`);
    }
}
    async callLLM(prompt, streamCallback = null) {
        if (!prompt) throw new Error("输入内容不能为空");
        if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
            console.error('[DEBUG-PROBE-3] API 配置不完整:', JSON.stringify(this.config, null, 2));
            throw new Error("API配置不完整，请在设置中检查。");
        }

        return await this.#callLLMWithRetry(prompt, streamCallback);
    }

    /**
     * @private
     *  包含自动重试逻辑的核心 LLM 调用方法。
     */
    async #callLLMWithRetry(prompt, streamCallback) {
        const MAX_RETRIES = 3;
        let lastError = null;
        let retryToast = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await this.#executeApiCall(prompt, streamCallback);
                
              if (retryToast) this.EDITOR.clear(retryToast);
            return result;
            } catch (error) {
                lastError = error;
                console.warn(`[LLMApiService] 第 ${attempt} 次API调用失败:`, error);

                 if (retryToast) this.EDITOR.clear(retryToast);
                
                if (attempt < MAX_RETRIES && this.#isRetryableError(error)) {
                    const delay = attempt * 1000; 
                    
                    retryToast = this.EDITOR.warning(
                        `将在 ${delay / 1000} 秒后进行第 ${attempt + 1} 次尝试...<br><small>原因: ${error.message}</small>`,
                        "API连接不稳定，正在自动重试",
                        { 
                            timeOut: delay, 
                            extendedTimeOut: delay, 
                            closeButton: true,
                            escapeHtml: false 
                        }   
                         );
                    await new Promise(resolve => setTimeout(resolve, delay));

                } else {
                    break;
                }
            }
        }
        
        this.EDITOR.error(
            `已尝试 ${MAX_RETRIES} 次，但仍无法连接。<br><small>最终错误: ${lastError.message}</small>`, 
            "API 调用彻底失败", 
            { timeOut: 10000 }
        );
        throw lastError;
    }

    /**
     * @private
     * [新] 判断一个错误是否值得重试。
     */
    #isRetryableError(error) {
        const errorMessage = (error.message || error.toString() || '').toLowerCase();
        // 4xx 错误通常是客户端问题，不应重试
        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('404')) {
            return false;
        }
        // 503 Service Unavailable 可能是临时性服务器问题，可以重试
        // 但如果是底层服务不可用（如后端 API 未启动），重试也无意义
        // 我们仍然允许重试，但会快速失败
        return true;
    }

    /**
     * @private
     * 策略分发器：根据 api_provider 决定使用哪种API调用策略
     * 这个方法只负责执行一次API调用，不关心重试。
     */
    async #executeApiCall(prompt, streamCallback = null) {
        let messages;
        if (Array.isArray(prompt)) {
            messages = prompt;
        } else {
             messages = [
                { role: 'system', content: this.config.system_prompt },
                { role: 'user', content: prompt }
            ];
        }

        this.config.stream = streamCallback !== null;

        // ================== 策略分发器 ==================
        switch (this.config.api_provider) {
            case 'sillytavern_proxy_openai':
                console.log("策略: SillyTavern 代理模式");
                return this.#callViaSillyTavernProxy(messages, streamCallback);

            case 'direct_openai':
            default:
                console.log("策略: 直接 Fetch 模式");
                return this.#callViaDirectFetch(messages, streamCallback);
        }
    }

    /**
     * @private
     * 策略一：通过 SillyTavern 后端进行代理请求
     * 此策略可绕过浏览器CORS限制，适用于需要代理的场景
     * 注意：此方法通过 HTTP 端点调用，与 Amily2 的实现方式一致
     */
    async #callViaSillyTavernProxy(messages, streamCallback) {
        try {
            const requestData = {
                stream: this.config.stream,
                messages: messages,
                max_tokens: this.config.max_tokens,
                model: this.config.model_name,
                temperature: this.config.temperature,
                chat_completion_source: 'openai',
                reverse_proxy: this.config.api_url,
                proxy_password: this.config.api_key || '',
            };

            console.log('[代理模式调试] 发送到 SillyTavern 后端的参数:', {
                ...requestData,
                proxy_password: requestData.proxy_password ? '***已设置***' : '(空)',
                messages: `${messages.length} 条消息`
            });

            const response = await fetch('/api/backends/chat-completions/generate', {
                method: 'POST',
                 headers: {
        ...getRequestHeaders(),
        'Content-Type': 'application/json'
    },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[代理模式] SillyTavern 后端返回错误:', response.status, errorText);

                // 针对 503 错误提供更友好的提示
                if (response.status === 503) {
                    throw new Error(`后端服务暂时不可用 (503)。可能原因:\n1. 目标 API 服务器未启动或过载\n2. SillyTavern 后端与目标 API 之间的连接问题\n3. API 配置错误 (请检查 URL: ${this.config.api_url})`);
                }

                throw new Error(`SillyTavern 后端请求失败 (${response.status}): ${errorText}`);
            }

            const responseData = await response.json();
            console.log('[代理模式调试] SillyTavern 后端响应:', responseData);

            // 处理响应
            if (responseData.error) {
                throw new Error(`API 错误: ${responseData.error.message || JSON.stringify(responseData.error)}`);
            }

            // 非流式响应
            const content = responseData.choices?.[0]?.message?.content || responseData.content;
            if (!content) {
                throw new Error("通过内部路由获取响应失败或响应内容为空");
            }

            return this.#cleanResponse(content);

        } catch (error) {
            console.error("通过 SillyTavern 内部路由调用 LLM API 错误:", error);
            throw error;
        }
    }

    /**
     * @private
     * 策略二：直接使用 fetch 进行 API 请求
     * 注意：此策略可能遇到CORS跨域问题
     */
    async #callViaDirectFetch(messages, streamCallback) {
        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: this.config.stream
        };

        try {
            if (this.config.stream) {
                if (!streamCallback || typeof streamCallback !== 'function') {
                    throw new Error("流式模式下必须提供有效的streamCallback函数");
                }
                return await this.#handleStreamResponse(apiEndpoint, headers, data, streamCallback);
            } else {
                return await this.#handleRegularResponse(apiEndpoint, headers, data);
            }
        } catch (error) {
            console.error("直接调用 LLM API 错误:", error);
            throw error;
        }
    }

    async #handleRegularResponse(apiEndpoint, headers, data) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();

        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("API返回无效的响应结构");
        }

        let translatedText = responseData.choices[0].message.content;
        return this.#cleanResponse(translatedText);
    }

    async #handleStreamResponse(apiEndpoint, headers, data, streamCallback) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';
        let chunkIndex = 0; 

        try {
            console.log('[Stream] Starting stream processing for custom API...'); 
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[Stream] Custom API stream finished (done=true).'); 
                    break;
                }

                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                chunkIndex++;
                console.log(`[Stream] Custom API received chunk ${chunkIndex}. Buffer length: ${buffer.length}`); 

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; 

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;
                    console.log(`[Stream] Custom API processing line: "${trimmedLine}"`); 

                    try {
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                console.log('[Stream] Custom API received [DONE] marker.'); 
                                continue; 
                            }

                            const jsonData = JSON.parse(dataStr);

                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content); 
                            } else {
                            }
                        } else {
                             console.log('[Stream] Custom API line does not start with "data: ". Skipping.');
                        }
                    } catch (e) {
                        console.warn("[Stream] Custom API error parsing line JSON:", e, "Line:", trimmedLine); 
                    }
                }
            }

            const finalBufferTrimmed = buffer.trim();
            if (finalBufferTrimmed) {
                console.log(`[Stream] Custom API processing final buffer content: "${finalBufferTrimmed}"`); 
                try {
                    if (finalBufferTrimmed.startsWith('data: ')) {
                         const dataStr = finalBufferTrimmed.substring(6).trim();
                         if (dataStr !== '[DONE]') {
                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                         }
                    }
                } catch (e) {
                    console.warn("[Stream] Custom API error processing final buffer content:", e);
                }
            }

            console.log('[Stream] Custom API stream processing complete. Full response length:', fullResponse.length); 
            return this.#cleanResponse(fullResponse);
        } catch (streamError) {
            console.error('[Stream] Custom API error during stream reading:', streamError); 
            throw streamError; 
        } finally {
            console.log('[Stream] Custom API releasing stream lock.'); 
            reader.releaseLock();
        }
    }

    #cleanResponse(text) {
        return text.trim();
    }

    
}

export default LLMApiService;
